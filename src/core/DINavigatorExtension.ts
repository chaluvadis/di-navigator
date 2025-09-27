import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';
import { TreeViewManager } from './TreeViewManager';
import { AnalysisService } from './AnalysisService';
import { WorkspaceAnalysis } from '../models';

export class DINavigatorExtension {
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;
    private readonly errorHandler: ErrorHandler;
    private readonly treeViewManager: TreeViewManager;
    private readonly analysisService: AnalysisService;

    private isInitialized = false;
    private isDisposed = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Initialize core services directly - streamlined architecture
        this.logger = new Logger();
        this.errorHandler = new ErrorHandler(this.logger);
        this.treeViewManager = new TreeViewManager(this.context, this.logger);
        this.analysisService = new AnalysisService(this.logger, this.errorHandler);
    }

    async initialize(): Promise<void> {
        if (this.isInitialized) {
            this.logger.warn('Extension is already initialized');
            return;
        }

        if (this.isDisposed) {
            throw new Error('Cannot initialize a disposed extension');
        }

        try {
            this.logger.info('Initializing DI Navigator Extension...');

            // Initialize tree view
            this.treeViewManager.initialize();

            // Initialize analysis service
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                this.analysisService.initialize(workspaceRoot);
            }

            // Register commands
            this.registerCommands();

            // Set up workspace context
            this.setupWorkspaceContext();

            // Set up auto-refresh if enabled
            this.setupAutoRefresh();

            this.isInitialized = true;
            this.logger.info('DI Navigator Extension initialized successfully');

        } catch (error) {
            this.errorHandler.handleError(error, 'Extension initialization failed');
            throw error;
        }
    }

    private registerCommands(): void {
        // Helper function to register commands with error handling
        const registerCommand = (id: string, handler: (...args: any[]) => any, title: string) => {
            const disposable = vscode.commands.registerCommand(id, async (...args: any[]) => {
                try {
                    this.logger.debug(`Executing command: ${id}`);
                    const result = await handler(...args);
                    this.logger.debug(`Command completed: ${id}`);
                    return result;
                } catch (error) {
                    this.logger.error(`Command failed: ${id}`, 'DINavigatorExtension', { error, args });
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    vscode.window.showErrorMessage(`Command '${title}' failed: ${errorMessage}`);
                    throw error;
                }
            });
            this.context.subscriptions.push(disposable);
            this.logger.info(`Registered command: ${id} (${title})`);
        };

        registerCommand(
            'di-navigator.analyzeProject',
            () => this.analyzeProject(),
            'Analyze the current .NET project for dependency injection configuration'
        );


        registerCommand(
            'di-navigator.findInjectionSites',
            () => this.findInjectionSites(),
            'Find and highlight all dependency injection sites in the project'
        );

        registerCommand(
            'di-navigator.detectConflicts',
            () => this.detectConflicts(),
            'Detect and display any dependency injection conflicts'
        );

        registerCommand(
            'di-navigator.openConfiguration',
            () => this.openConfiguration(),
            'Open the DI Navigator configuration settings'
        );

        registerCommand(
            'di-navigator.refreshTreeView',
            () => this.refreshTreeView(),
            'Refresh the DI Navigator tree view with latest analysis data'
        );

        registerCommand(
            'di-navigator.showServiceDetails',
            (serviceItem: any) => this.showServiceDetails(serviceItem),
            'Show detailed service information'
        );

        registerCommand(
            'di-navigator.navigateToServiceRegistration',
            (serviceItem: any) => this.navigateToServiceRegistration(serviceItem),
            'Navigate to service registration location'
        );

        registerCommand(
            'di-navigator.showServiceSummary',
            (serviceItem: any) => this.showServiceSummary(serviceItem),
            'Show service summary information'
        );

        registerCommand(
            'di-navigator.showServiceConflicts',
            (serviceItem: any) => this.showServiceConflicts(serviceItem),
            'Show service conflicts'
        );

        this.logger.info('All commands registered successfully');
    }

    private setupWorkspaceContext(): void {
        const hasWorkspace = vscode.workspace.workspaceFolders !== undefined;
        vscode.commands.executeCommand('setContext', 'diNavigator:validWorkspace', hasWorkspace);

        if (hasWorkspace) {
            const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
            vscode.commands.executeCommand('setContext', 'diNavigator:workspaceRoot', workspaceRoot);
        }
    }

    private setupAutoRefresh(): void {
        const config = vscode.workspace.getConfiguration('di-navigator');
        const autoRefresh = config.get('autoRefresh', false);
        if (autoRefresh) {
            const refreshInterval = config.get('refreshInterval', 5000);

            const intervalId = setInterval(() => {
                if (vscode.window.activeTextEditor?.document.fileName.endsWith('.cs')) {
                    this.analyzeProject();
                }
            }, refreshInterval);

            // Store interval ID for cleanup
            this.context.subscriptions.push({
                dispose: () => clearInterval(intervalId)
            });

            this.logger.info(`Auto-refresh enabled with ${refreshInterval}ms interval`);
        }
    }

    async analyzeProject(): Promise<void> {
        try {
            this.logger.info('Starting project analysis...');

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const projectPath = workspaceFolders[0].uri.fsPath;

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DI Navigator: Analyzing project...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Starting analysis...' });

                const analysisResult = await this.analysisService.analyzeProject(projectPath);

                progress.report({ message: 'Analysis complete!' });

                // Wrap the single project result in WorkspaceAnalysis format
                const workspaceAnalysis: WorkspaceAnalysis = {
                    projects: [analysisResult],
                    totalServices: analysisResult.serviceGroups.reduce(
                        (acc: number, group: any) => acc + group.services.length, 0
                    ),
                    totalProjects: 1,
                    analysisTimestamp: new Date()
                };

                // Log the structure for debugging
                this.logger.info('WorkspaceAnalysis structure created', 'DINavigatorExtension', {
                    totalServices: workspaceAnalysis.totalServices,
                    totalProjects: workspaceAnalysis.totalProjects,
                    projectName: analysisResult.projectName,
                    serviceGroupsCount: analysisResult.serviceGroups.length
                });

                // Update tree view with results
                this.treeViewManager.updateAnalysisData(workspaceAnalysis);

                // Show results summary
                const serviceCount = analysisResult.serviceGroups.reduce(
                    (acc: number, group: any) => acc + group.services.length, 0
                );

                vscode.window.showInformationMessage(
                    `DI Navigator: Found ${serviceCount} services in ${analysisResult.serviceGroups.length} groups`
                );

                this.logger.info(`Analysis completed: ${serviceCount} services found`);
            });

        } catch (error) {
            this.errorHandler.handleError(error, 'Project analysis failed');
        }
    }

    async findInjectionSites(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            const diagnostics = vscode.languages.createDiagnosticCollection('di-injection-sites');
            const injectionDiagnostics: vscode.Diagnostic[] = [];

            for (const project of analysisData.projects) {
                for (const group of project.serviceGroups) {
                    for (const service of group.services) {
                        for (const site of service.injectionSites) {
                            const uri = vscode.Uri.file(site.filePath);
                            const range = new vscode.Range(
                                new vscode.Position(site.lineNumber - 1, 0),
                                new vscode.Position(site.lineNumber - 1, 100)
                            );

                            const diagnostic = new vscode.Diagnostic(
                                range,
                                `Injects ${site.serviceType}`,
                                vscode.DiagnosticSeverity.Information
                            );

                            diagnostic.source = 'DI Service Navigator';
                            injectionDiagnostics.push(diagnostic);

                            // Group diagnostics by file
                            const existingDiagnostics = diagnostics.get(uri) || [];
                            diagnostics.set(uri, [...existingDiagnostics, diagnostic]);
                        }
                    }
                }
            }

            vscode.window.showInformationMessage(
                `DI Navigator: Found ${injectionDiagnostics.length} injection sites`
            );

            this.logger.info(`Found ${injectionDiagnostics.length} injection sites`);
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to find injection sites');
        }
    }

    async detectConflicts(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            const conflicts = analysisData.projects
                .flatMap(project => project.serviceGroups)
                .flatMap((group: any) => group.services)
                .filter((service: any) => service.hasConflicts);

            if (conflicts.length === 0) {
                vscode.window.showInformationMessage('DI Navigator: No conflicts detected');
                return;
            }

            const conflictDetails = conflicts.map(service => {
                const conflict = service.conflicts?.[0];
                return `${service.name}: ${conflict?.details || 'Unknown conflict'}`;
            }).join('\n');

            const document = await vscode.workspace.openTextDocument({
                content: `Dependency Injection Conflicts Detected:\n\n${conflictDetails}`,
                language: 'text'
            });

            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: true
            });

            this.logger.info(`Found ${conflicts.length} conflicts`);

        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to detect conflicts');
        }
    }

    async openConfiguration(): Promise<void> {
        try {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'di-navigator');
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to open configuration');
        }
    }

    refreshTreeView(): void {
        try {
            this.treeViewManager.refresh();
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to refresh tree view');
        }
    }

    showServiceDetails(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Delegate to TreeViewManager
                const mockTreeItem = {
                    serviceData: serviceItem.serviceData,
                    itemType: 'service'
                } as any;
                this.treeViewManager['showServiceDetails'](serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service details');
        }
    }

    navigateToServiceRegistration(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Delegate to TreeViewManager
                this.treeViewManager['navigateToFirstRegistration'](serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to navigate to service registration');
        }
    }

    showServiceSummary(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Delegate to TreeViewManager
                this.treeViewManager['showServiceSummary'](serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service summary');
        }
    }

    showServiceConflicts(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Delegate to TreeViewManager
                this.treeViewManager['showServiceConflicts'](serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service conflicts');
        }
    }

    dispose(): void {
        try {
            if (this.isDisposed) {
                return;
            }
            this.logger.info('Disposing DI Navigator Extension...');

            this.analysisService.dispose();
            this.treeViewManager.dispose();

            this.isDisposed = true;
            this.logger.info('DI Navigator Extension disposed successfully');
        } catch (error) {
            this.logger.error('Error during extension disposal', 'DINavigatorExtension', error);
        }
    }
}