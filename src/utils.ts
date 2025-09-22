import {
    workspace, window, commands, Uri, FileSystemError,
    ProgressLocation, ExtensionContext, Range
} from 'vscode';
import { serviceProvider } from './serviceProvider';
import { diNavigatorProvider } from './treeView';
import {
    CONFIG_EXCLUDE_FOLDERS, CONFIG_SECTION,
    DEFAULT_EXCLUDE_FOLDERS,
    NET_FILE_PATTERNS,
    VALID_WORKSPACE_CONTEXT
} from './const';

// Enhanced error handling types
export enum AnalyzerErrorType {
    TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
    EXECUTION_FAILED = 'EXECUTION_FAILED',
    JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
    RUNTIME_ERROR = 'RUNTIME_ERROR',
}

export interface AnalyzerError {
    type: AnalyzerErrorType;
    message: string;
    originalError?: any;
    context?: string;
    suggestions?: string[];
}

/**
 * Debounce utility function
 */
export const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(null, args), delay);
    };
};

/**
 * Get exclude glob pattern from configuration
 */
export function getExcludeGlob(fallbackPatterns: readonly string[]): string {
    const config = workspace.getConfiguration(CONFIG_SECTION);
    const patterns = config.get<string[]>(CONFIG_EXCLUDE_FOLDERS) || Array.from(fallbackPatterns);
    return patterns.length > 1 ? `{${patterns.join(',')}}` : patterns[0];
}

export function getToolPath(_context: ExtensionContext): string {
    // JavaScript-based parsing - no external tool needed
    console.log(`DI Navigator: Using JavaScript-based DI analysis`);
    return 'javascript-parser';
}


/**
 * Detect if current workspace is a .NET workspace
 */
export async function detectNetWorkspace(): Promise<boolean> {
    try {
        const excludeGlob = getExcludeGlob(DEFAULT_EXCLUDE_FOLDERS);
        console.log(`🔍 DI Navigator: detectNetWorkspace() called`);
        console.log(`🔍 DI Navigator: Using exclude glob: ${excludeGlob}`);
        console.log(`🔍 DI Navigator: NET_FILE_PATTERNS:`, NET_FILE_PATTERNS);

        const csprojFiles = await workspace.findFiles(NET_FILE_PATTERNS[0], excludeGlob);
        const slnFiles = await workspace.findFiles(NET_FILE_PATTERNS[1], excludeGlob);
        const slnxFiles = await workspace.findFiles(NET_FILE_PATTERNS[2], excludeGlob);
        const csFiles = await workspace.findFiles(NET_FILE_PATTERNS[3], excludeGlob);

        console.log(`📁 DI Navigator: Found files:`);
        console.log(`  - .csproj files: ${csprojFiles.length}`, csprojFiles.map(f => f.fsPath));
        console.log(`  - .sln files: ${slnFiles.length}`, slnFiles.map(f => f.fsPath));
        console.log(`  - .slnx files: ${slnxFiles.length}`, slnxFiles.map(f => f.fsPath));
        console.log(`  - .cs files: ${csFiles.length}`, csFiles.map(f => f.fsPath));

        const isNet = csprojFiles.length > 0 || slnFiles.length > 0 || slnxFiles.length > 0 || csFiles.length > 0;
        console.log(`📋 DI Navigator: detectNetWorkspace result - ${isNet}`);

        if (!isNet) {
            console.log(`⚠️ DI Navigator: No .NET files found, this will trigger clearState()`);
        }

        return isNet;
    } catch (error) {
        console.error('❌ DI Navigator: Error detecting .NET workspace:', error);
        return false;
    }
}

/**
 * Refresh both service provider and tree view provider
 */
export async function refreshProviders(): Promise<void> {
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
}

/**
 * Enhanced analyzer error handling and categorization
 */
export function handleAnalyzerError(error: any, context: string): AnalyzerError {
    console.error(`DI Navigator: Error in ${context}:`, error);

    // Categorize the error
    if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('ENOENT')) {
            return {
                type: AnalyzerErrorType.TOOL_NOT_FOUND,
                message: `Roslyn analyzer not found: ${error.message}`,
                originalError: error,
                context,
                suggestions: [
                    'Check if the analyzer is properly built',
                    'Verify the tool path configuration',
                    'Try restarting VS Code'
                ]
            };
        }

        if (error.message.includes('dotnet') || error.message.includes('runtime')) {
            return {
                type: AnalyzerErrorType.RUNTIME_ERROR,
                message: `Runtime error: ${error.message}`,
                originalError: error,
                context,
                suggestions: [
                    'Ensure .NET 6.0+ is installed',
                    'Check .NET runtime availability',
                    'Try restarting VS Code'
                ]
            };
        }

        if (error.message.includes('JSON') || error.message.includes('parse')) {
            return {
                type: AnalyzerErrorType.JSON_PARSE_ERROR,
                message: `Failed to parse analyzer output: ${error.message}`,
                originalError: error,
                context,
                suggestions: [
                    'Check analyzer output format',
                    'Verify project compatibility',
                    'Try with a simpler test project'
                ]
            };
        }
    }

    return {
        type: AnalyzerErrorType.EXECUTION_FAILED,
        message: `Analyzer execution failed: ${error?.message || 'Unknown error'}`,
        originalError: error,
        context,
        suggestions: [
            'Check the console logs for details',
            'Try restarting the extension',
            'Verify project structure'
        ]
    };
}

/**
 * Display analyzer error to user with appropriate actions
 */
export function showAnalyzerError(error: AnalyzerError): void {
    const { type, message, suggestions } = error;

    switch (type) {
        case AnalyzerErrorType.TOOL_NOT_FOUND:
            window.showErrorMessage(message, 'Configure Tool Path', 'Refresh Services')
                .then(selection => {
                    if (selection === 'Configure Tool Path') {
                        commands.executeCommand('workbench.action.openSettings', 'diNavigator.toolPath');
                    } else if (selection === 'Refresh Services') {
                        commands.executeCommand('di-navigator.refreshServices');
                    }
                });
            break;

        case AnalyzerErrorType.RUNTIME_ERROR:
            window.showErrorMessage(message, 'Install .NET Runtime', 'Check Requirements')
                .then(selection => {
                    if (selection === 'Install .NET Runtime') {
                        commands.executeCommand('vscode.open', 'https://dotnet.microsoft.com/download');
                    }
                });
            break;

        default:
            window.showErrorMessage(message);
    }

    // Log suggestions to console
    if (suggestions && suggestions.length > 0) {
        console.log('DI Navigator: Suggestions to resolve the error:');
        suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${suggestion}`);
        });
    }
}

/**
 * Centralized error handling for file operations
 */
export function handleFileError(operation: string, error: unknown, filePath?: string): void {
    if (error instanceof FileSystemError && error.code === 'EntryNotFound') {
        window.showWarningMessage(`File not found: ${filePath || 'unknown'}`);
    } else if (error instanceof Error) {
        window.showErrorMessage(`Error ${operation}: ${error.message}`);
    } else {
        window.showErrorMessage(`Error ${operation}: Unknown error`);
    }
    console.log(`DI Navigator: ${operation} command failed.`);
}

/**
 * Validate file exists and open it at specific line
 */
export async function validateAndOpenFile(filePath: string, lineNumber: number): Promise<boolean> {
    try {
        const uri = Uri.file(filePath);
        await workspace.fs.stat(uri);
        const doc = await workspace.openTextDocument(uri);
        const range = new Range(lineNumber - 1, 0, lineNumber - 1, 0);
        await window.showTextDocument(doc, { selection: range });
        return true;
    } catch (error) {
        handleFileError('opening file', error, filePath);
        return false;
    }
}

/**
 * Navigate to a specific location in a file with logging
 */
export async function navigateToLocation(filePath: string, lineNumber: number): Promise<boolean> {
    const success = await validateAndOpenFile(filePath, lineNumber);
    if (success) {
        console.log(`DI Navigator: Navigation succeeded: ${filePath}:${lineNumber}`);
    } else {
        console.log('DI Navigator: Navigation failed: Invalid file');
    }
    return success;
}

/**
 * Update workspace context based on .NET detection
 */
export async function updateWorkspaceContext(): Promise<void> {
    console.log('🔍 DI Navigator: updateWorkspaceContext() called');

    const isNet = await detectNetWorkspace();
    console.log(`📋 DI Navigator: .NET workspace detected: ${isNet}`);

    await commands.executeCommand('setContext', VALID_WORKSPACE_CONTEXT, isNet);

    if (isNet) {
        console.log('✅ DI Navigator: .NET workspace context set to true');
        try {
            // Validate runtime environment first
            const runtimeValidation = await validateRuntimeEnvironment();
            if (!runtimeValidation.isValid) {
                console.warn('❌ DI Navigator: Runtime validation failed:', runtimeValidation.error);
                window.showWarningMessage(
                    `DI Navigator: ${runtimeValidation.error}. Some features may not work correctly.`,
                    'Install .NET Runtime'
                ).then(selection => {
                    if (selection === 'Install .NET Runtime') {
                        commands.executeCommand('vscode.open', 'https://dotnet.microsoft.com/download');
                    }
                });
                return;
            }

            // Test if tool path resolution works before attempting scan
            const context = serviceProvider.getContext();
            if (context) {
                const toolPath = getToolPath(context);
                console.log('🔧 DI Navigator: Tool found at:', toolPath);
            }

            // Run background scan
            console.log('🚀 DI Navigator: Starting background DI scan...');
            await runBackgroundScan();
            console.log('✅ DI Navigator: Background scan completed');
        } catch (error) {
            console.error('❌ DI Navigator: Background scan failed:', error);
            // Show error to user instead of silently failing
            window.showErrorMessage(`DI Navigator: Failed to scan for DI registrations. Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
            // Don't clear state or refresh - just skip the scan
            // The tree view will show empty state until user triggers manual scan
        }
    } else {
        console.log('⚠️ DI Navigator: Non-.NET workspace detected. This will clear all DI analysis data!');
        console.log('🧹 DI Navigator: Calling serviceProvider.clearState()...');
        serviceProvider.clearState();
        console.log('🔄 DI Navigator: Refreshing treeview provider after clearing state...');
        diNavigatorProvider.refresh();
        console.log('❌ DI Navigator: Treeview data has been cleared due to non-.NET workspace detection');
    }
}

/**
 * Run background scan with progress notification
 */
export async function runBackgroundScan(): Promise<void> {
    console.log('🚀 DI Navigator: === STARTING BACKGROUND SCAN ===');
    console.log('🚀 DI Navigator: runBackgroundScan() called');

    return window.withProgress({
        location: ProgressLocation.Notification,
        title: 'DI Navigator: Scanning C# files',
        cancellable: false
    }, async (progress) => {
        try {
            console.log('🔄 DI Navigator: Starting background scan...');
            console.log('📊 DI Navigator: Current service provider state before scan:');
            const currentProjects = serviceProvider.getProjectDI();
            console.log(`📊 DI Navigator: Projects before scan: ${currentProjects.length}`);

            await serviceProvider.collectRegistrations(progress);
            console.log('✅ DI Navigator: Background scan completed successfully');

            const projectsAfterScan = serviceProvider.getProjectDI();
            console.log('📊 DI Navigator: Projects after scan:', projectsAfterScan.map(p => ({
                name: p.projectName,
                serviceGroups: p.serviceGroups.length,
                totalServices: p.serviceGroups.reduce((acc, sg) => acc + sg.services.length, 0)
            })));

            console.log('🔄 DI Navigator: Refreshing treeview provider...');
            diNavigatorProvider.refresh();
            console.log('🌳 DI Navigator: Treeview provider refreshed');
            console.log('✅ DI Navigator: === BACKGROUND SCAN COMPLETED ===');
        } catch (error) {
            console.error('❌ DI Navigator: === BACKGROUND SCAN FAILED ===');
            console.error('❌ DI Navigator: Error during DI scan:', error);
            console.error('❌ DI Navigator: Error details:', error instanceof Error ? error.stack : error);
            console.log('🔄 DI Navigator: Refreshing treeview provider after error...');
            diNavigatorProvider.refresh();
            console.log('❌ DI Navigator: === BACKGROUND SCAN ERROR HANDLED ===');
            throw error;
        }
    });
}


/**
 * Setup file system watchers for patterns
 */
export function setupFileSystemWatchers(
    context: ExtensionContext,
    patterns: string[],
    handler: (uri: Uri) => void
): void {
    patterns.forEach(pattern => {
        const watcher = workspace.createFileSystemWatcher(pattern);
        watcher.onDidCreate(handler);
        watcher.onDidDelete(handler);
        watcher.onDidChange(handler);
        context.subscriptions.push(watcher);
    });
}

/**
 * Create debounced refresh handler for file changes
 */
export function createDebouncedRefreshHandler(delay: number = 500) {
    const debouncedRefresh = debounce((uri: Uri) => {
        console.log(`DI Navigator: File changed: ${uri.fsPath}, triggering refresh`);
        refreshProviders().catch((err) => {
            console.error('Error during refresh:', err);
        });
    }, delay);

    return debouncedRefresh;
}

/**
 * Centralized logging utility
 */
export function logCommand(commandName: string, message?: string): void {
    console.log(`DI Navigator: ${commandName} command ${message || 'executed'}.`);
}

/**
 * Validate .NET runtime environment
 */
export async function validateRuntimeEnvironment(): Promise<{
    isValid: boolean;
    version?: string;
    error?: string;
}> {
    try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');

        const execAsync = promisify(exec);

        // Check if dotnet is available
        const { stdout: versionOutput } = await execAsync('dotnet --version');
        const version = versionOutput.trim();

        // Check minimum version requirement (6.0.0)
        const requiredVersion = '6.0.0';
        const isVersionValid = compareVersions(version, requiredVersion) >= 0;

        if (!isVersionValid) {
            return {
                isValid: false,
                version,
                error: `Insufficient .NET version. Required: ${requiredVersion}, Found: ${version}`
            };
        }

        console.log(`DI Navigator: .NET runtime validated. Version: ${version}`);
        return { isValid: true, version };

    } catch (error) {
        return {
            isValid: false,
            error: `.NET runtime not found or not accessible: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
    }
}

/**
 * Compare two version strings
 */
function compareVersions(version1: string, version2: string): number {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
        const v1Part = v1Parts[i] || 0;
        const v2Part = v2Parts[i] || 0;

        if (v1Part > v2Part) { return 1; }
        if (v1Part < v2Part) { return -1; }
    }

    return 0;
}

/**
 * Register command and automatically add to subscriptions
 */
export function registerCommand(context: ExtensionContext, commandName: string, handler: (...args: any[]) => any) {
    const disposable = commands.registerCommand(commandName, handler);
    context.subscriptions.push(disposable);
    return disposable;
}