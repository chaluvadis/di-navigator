import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';
import { TreeViewManager } from './TreeViewManager';
import { AnalysisService } from './AnalysisService';
import { DataValidator } from './DataValidator';
import { WorkspaceAnalysis } from '../models';

export class DINavigatorExtension {
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;
    private readonly errorHandler: ErrorHandler;
    private readonly treeViewManager: TreeViewManager;
    private readonly analysisService: AnalysisService;
    private readonly dataValidator: DataValidator;

    private _isInitialized = false;
    private isDisposed = false;

    public get isInitialized(): boolean {
        return this._isInitialized;
    }

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        // Initialize core services directly - streamlined architecture
        this.logger = new Logger();
        this.errorHandler = new ErrorHandler(this.logger);
        this.treeViewManager = new TreeViewManager(this.context, this.logger);
        this.analysisService = new AnalysisService(this.logger, this.errorHandler);
        this.dataValidator = new DataValidator(this.logger);
    }

    async initialize(): Promise<void> {
        if (this._isInitialized) {
            this.logger.warn('Extension is already initialized');
            return;
        }

        if (this.isDisposed) {
            throw new Error('Cannot initialize a disposed extension');
        }

        try {
            this.logger.info('Initializing DI Navigator Extension...');

            // Validate workspace context first
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder available. Please open a .NET project.');
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            this.logger.info(`Initializing for workspace: ${workspaceRoot}`);

            // Initialize tree view first
            this.treeViewManager.initialize();

            // Ensure tree view is visible immediately
            setTimeout(() => {
                this.treeViewManager.ensureVisible();
            }, 1000);

            // Initialize analysis service
            this.analysisService.initialize(workspaceRoot);

            // Register commands
            this.registerCommands();

            // Set up workspace context
            this.setupWorkspaceContext();

            // Set up auto-refresh if enabled
            this.setupAutoRefresh();

            // Set up configuration integration
            this.setupConfigurationIntegration();

            // Set up workspace change handling
            this.setupWorkspaceChangeHandling();

            this._isInitialized = true;
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
            'di-navigator.analyzeSolution',
            () => this.analyzeSolution(),
            'Analyze all projects in the .NET solution for dependency injection configuration'
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

        registerCommand(
            'di-navigator.searchServices',
            () => this.searchServices(),
            'Search and filter services in the analysis'
        );

        registerCommand(
            'di-navigator.filterByLifetime',
            () => this.filterByLifetime(),
            'Filter services by lifetime'
        );

        registerCommand(
            'di-navigator.showDependencyGraph',
            () => this.showDependencyGraph(),
            'Show service dependency graph'
        );

        registerCommand(
            'di-navigator.exportAnalysis',
            () => this.exportAnalysis(),
            'Export analysis results to file'
        );

        registerCommand(
            'di-navigator.showTreeView',
            () => this.showTreeView(),
            'Show the DI Navigator tree view'
        );

        registerCommand(
            'di-navigator.recreateTreeView',
            () => this.recreateTreeView(),
            'Recreate the tree view (troubleshooting)'
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

    private setupConfigurationIntegration(): void {
        // Watch for configuration changes
        const configWatcher = vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration('di-navigator')) {
                this.logger.info('DI Navigator configuration changed, reloading...');

                // Reconfigure analyzer based on new settings
                const useExternalTools = vscode.workspace.getConfiguration('di-navigator').get('useExternalTools', true);
                // Update analyzer configuration here

                this.logger.info('Configuration reloaded successfully');
            }
        });

        this.context.subscriptions.push(configWatcher);
    }

    private setupWorkspaceChangeHandling(): void {
        // Handle workspace folder changes
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders((event) => {
            const currentWorkspaceFolders = vscode.workspace.workspaceFolders;

            if (!currentWorkspaceFolders || currentWorkspaceFolders.length === 0) {
                this.logger.info('Workspace folders removed, clearing analysis data');
                this.treeViewManager.clear();
                return;
            }

            const newWorkspaceRoot = currentWorkspaceFolders[0].uri.fsPath;
            this.logger.info(`Workspace changed to: ${newWorkspaceRoot}`);

            // Clear existing data when workspace changes
            this.treeViewManager.clear();

            // Reinitialize analysis service for new workspace
            this.analysisService.initialize(newWorkspaceRoot);

            // Show message about workspace change
            const workspaceName = currentWorkspaceFolders[0].name;
            vscode.window.showInformationMessage(
                `DI Navigator: Switched to workspace "${workspaceName}". Please re-analyze to see project data.`
            );
        });

        this.context.subscriptions.push(workspaceChangeListener);
        this.logger.info('Workspace change handling set up');
    }

    async analyzeProject(): Promise<void> {
        try {
            this.logger.info('Starting project analysis...');

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder found. Please open a .NET project.');
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const solutionPath = await this.findSolutionFile(workspaceRoot) || workspaceRoot;

            this.logger.info(`Analyzing workspace: ${workspaceRoot}`);
            this.logger.info(`Using solution/project file: ${solutionPath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DI Navigator: Analyzing project...',
                cancellable: true
            }, async (progress, token) => {
                // Check for cancellation
                token.onCancellationRequested(() => {
                    this.logger.info('Analysis cancelled by user');
                    throw new Error('Analysis cancelled by user');
                });

                // Detailed progress steps
                const progressSteps = [
                    { message: 'Initializing analysis...', increment: 5 },
                    { message: 'Parsing solution structure...', increment: 15 },
                    { message: 'Analyzing project files...', increment: 30 },
                    { message: 'Detecting service registrations...', increment: 50 },
                    { message: 'Finding injection sites...', increment: 65 },
                    { message: 'Analyzing service lifetimes...', increment: 75 },
                    { message: 'Detecting conflicts...', increment: 85 },
                    { message: 'Processing results...', increment: 95 },
                    { message: 'Finalizing analysis...', increment: 100 }
                ];

                let currentStep = 0;
                const reportProgress = (stepIndex: number, additionalInfo?: string) => {
                    const step = progressSteps[stepIndex];
                    const message = additionalInfo ? `${step.message} ${additionalInfo}` : step.message;
                    progress.report({ message, increment: step.increment });
                };

                let allProjects: any[];

                try {
                    reportProgress(currentStep++);

                    // Initialize analysis
                    await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
                    reportProgress(currentStep++);

                    // Parse solution - now analyze as solution to get all projects
                    allProjects = await this.analysisService.analyzeSolution(solutionPath);

                    if (allProjects.length === 0) {
                        throw new Error('No projects found in solution');
                    }

                    reportProgress(currentStep++);

                    // Calculate totals across all projects
                    const totalServices = allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) => acc2 + group.services.length, 0), 0);
                    reportProgress(currentStep++, `(${totalServices} services found in ${allProjects.length} projects)`);

                    // Find injection sites across all projects
                    const totalInjections = allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) =>
                            acc2 + group.services.reduce((acc3: number, service: any) => acc3 + service.injectionSites.length, 0), 0), 0);
                    reportProgress(currentStep++, `(${totalInjections} sites found)`);

                    // Analyze lifetimes across all projects
                    const totalGroups = allProjects.reduce((acc: number, project: any) => acc + project.serviceGroups.length, 0);
                    reportProgress(currentStep++, `(${totalGroups} groups)`);

                    // Detect conflicts across all projects
                    const totalConflicts = allProjects.reduce((acc: number, project: any) =>
                        acc + (project.lifetimeConflicts?.length || 0) + (project.serviceDependencyIssues?.length || 0), 0);
                    reportProgress(currentStep++, `(${totalConflicts} issues found)`);

                    // Process results
                    reportProgress(currentStep++);

                    // Finalize
                    reportProgress(currentStep++);

                } catch (error) {
                    // Show error in progress and re-throw
                    progress.report({ message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, increment: 100 });
                    throw error;
                }

                // Create workspace analysis with all projects
                const workspaceAnalysis: WorkspaceAnalysis = {
                    projects: allProjects,
                    totalServices: allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) => acc2 + group.services.length, 0), 0),
                    totalProjects: allProjects.length,
                    analysisTimestamp: new Date()
                };

                // Validate analysis data
                const validationResult = this.dataValidator.validateWorkspaceAnalysis(workspaceAnalysis);

                if (!validationResult.isValid) {
                    this.logger.warn('Analysis data validation failed', 'DINavigatorExtension', {
                        errorCount: validationResult.summary.errorCount,
                        warningCount: validationResult.summary.warningCount
                    });

                    // Show validation issues to user
                    const errorIssues = validationResult.issues.filter(i => i.severity === 'Error');
                    if (errorIssues.length > 0) {
                        const errorMessages = errorIssues.map(issue => `• ${issue.message}`).join('\n');
                        vscode.window.showWarningMessage(
                            `DI Navigator: Analysis completed with ${errorIssues.length} data issues:\n${errorMessages}`,
                            'View Details'
                        ).then(selection => {
                            if (selection === 'View Details') {
                                this.showValidationDetails(validationResult);
                            }
                        });
                    }
                }

                // Log the structure for debugging
                this.logger.info('WorkspaceAnalysis structure created', 'DINavigatorExtension', {
                    totalServices: workspaceAnalysis.totalServices,
                    totalProjects: workspaceAnalysis.totalProjects,
                    projectNames: allProjects.map((p: any) => p.projectName),
                    validationPassed: validationResult.isValid,
                    validationIssues: validationResult.summary.totalIssues
                });

                // Update tree view with results
                this.treeViewManager.updateAnalysisData(workspaceAnalysis);

                // Show results summary
                vscode.window.showInformationMessage(
                    `DI Navigator: Found ${workspaceAnalysis.totalServices} services across ${workspaceAnalysis.totalProjects} projects`
                );

                this.logger.info(`Analysis completed: ${workspaceAnalysis.totalServices} services across ${workspaceAnalysis.totalProjects} projects`);
            });

        } catch (error) {
            this.errorHandler.handleError(error, 'Project analysis failed');
        }
    }

    async analyzeSolution(): Promise<void> {
        try {
            this.logger.info('Starting solution analysis...');

            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const solutionPath = await this.findSolutionFile(workspaceRoot);

            if (!solutionPath) {
                throw new Error('No .NET solution (.sln, .slnx) or project (.csproj) files found in workspace. Please ensure you have opened a .NET project.');
            }

            this.logger.info(`Using solution/project file: ${solutionPath}`);

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'DI Navigator: Analyzing solution...',
                cancellable: true
            }, async (progress, token) => {
                // Check for cancellation
                token.onCancellationRequested(() => {
                    this.logger.info('Solution analysis cancelled by user');
                    throw new Error('Analysis cancelled by user');
                });

                // Detailed progress steps
                const progressSteps = [
                    { message: 'Initializing solution analysis...', increment: 5 },
                    { message: 'Parsing solution structure...', increment: 15 },
                    { message: 'Analyzing all projects...', increment: 30 },
                    { message: 'Detecting service registrations...', increment: 50 },
                    { message: 'Finding injection sites...', increment: 65 },
                    { message: 'Analyzing service lifetimes...', increment: 75 },
                    { message: 'Detecting conflicts...', increment: 85 },
                    { message: 'Processing results...', increment: 95 },
                    { message: 'Finalizing analysis...', increment: 100 }
                ];

                let currentStep = 0;
                const reportProgress = (stepIndex: number, additionalInfo?: string) => {
                    const step = progressSteps[stepIndex];
                    const message = additionalInfo ? `${step.message} ${additionalInfo}` : step.message;
                    progress.report({ message, increment: step.increment });
                };

                let allProjects: any[];

                try {
                    reportProgress(currentStep++);

                    // Initialize analysis
                    await new Promise(resolve => setTimeout(resolve, 100));
                    reportProgress(currentStep++);

                    // Analyze all projects in solution
                    allProjects = await this.analysisService.analyzeSolution(solutionPath);
                    reportProgress(currentStep++);

                    if (allProjects.length === 0) {
                        throw new Error('No projects found in solution');
                    }

                    // Analyze registrations across all projects
                    const totalServices = allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) => acc2 + group.services.length, 0), 0);
                    reportProgress(currentStep++, `(${totalServices} services found in ${allProjects.length} projects)`);

                    // Find injection sites
                    const totalInjections = allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) =>
                            acc2 + group.services.reduce((acc3: number, service: any) => acc3 + service.injectionSites.length, 0), 0), 0);
                    reportProgress(currentStep++, `(${totalInjections} sites found)`);

                    // Analyze lifetimes
                    const totalGroups = allProjects.reduce((acc: number, project: any) => acc + project.serviceGroups.length, 0);
                    reportProgress(currentStep++, `(${totalGroups} groups)`);

                    // Detect conflicts
                    const totalConflicts = allProjects.reduce((acc: number, project: any) =>
                        acc + (project.lifetimeConflicts?.length || 0) + (project.serviceDependencyIssues?.length || 0), 0);
                    reportProgress(currentStep++, `(${totalConflicts} issues found)`);

                    // Process results
                    reportProgress(currentStep++);

                    // Finalize
                    reportProgress(currentStep++);

                } catch (error) {
                    progress.report({ message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, increment: 100 });
                    throw error;
                }

                // Create workspace analysis with all projects
                const workspaceAnalysis: WorkspaceAnalysis = {
                    projects: allProjects,
                    totalServices: allProjects.reduce((acc: number, project: any) =>
                        acc + project.serviceGroups.reduce((acc2: number, group: any) => acc2 + group.services.length, 0), 0),
                    totalProjects: allProjects.length,
                    analysisTimestamp: new Date()
                };

                // Validate analysis data
                const validationResult = this.dataValidator.validateWorkspaceAnalysis(workspaceAnalysis);

                if (!validationResult.isValid) {
                    this.logger.warn('Solution analysis data validation failed', 'DINavigatorExtension', {
                        errorCount: validationResult.summary.errorCount,
                        warningCount: validationResult.summary.warningCount
                    });

                    const errorIssues = validationResult.issues.filter((i: any) => i.severity === 'Error');
                    if (errorIssues.length > 0) {
                        const errorMessages = errorIssues.map((issue: any) => `• ${issue.message}`).join('\n');
                        vscode.window.showWarningMessage(
                            `DI Navigator: Solution analysis completed with ${errorIssues.length} data issues:\n${errorMessages}`,
                            'View Details'
                        ).then(selection => {
                            if (selection === 'View Details') {
                                this.showValidationDetails(validationResult);
                            }
                        });
                    }
                }

                // Update tree view with all projects
                this.treeViewManager.updateAnalysisData(workspaceAnalysis);

                // Show results summary
                const totalServices = workspaceAnalysis.totalServices;
                const totalProjects = workspaceAnalysis.totalProjects;

                vscode.window.showInformationMessage(
                    `DI Navigator: Found ${totalServices} services across ${totalProjects} projects`
                );

                this.logger.info(`Solution analysis completed: ${totalServices} services across ${totalProjects} projects`);
            });

        } catch (error) {
            this.errorHandler.handleError(error, 'Solution analysis failed');
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

            // Check for enhanced lifetime conflicts from the new Roslyn tool
            const lifetimeConflicts = analysisData.projects
                .flatMap(project => project.lifetimeConflicts || [])
                .filter(conflict => conflict.severity === 'High' || conflict.severity === 'Critical');

            // Check for legacy conflicts
            const legacyConflicts = analysisData.projects
                .flatMap(project => project.serviceGroups)
                .flatMap((group: any) => group.services)
                .filter((service: any) => service.hasConflicts);

            const allConflicts = [...lifetimeConflicts, ...legacyConflicts];

            if (allConflicts.length === 0) {
                vscode.window.showInformationMessage('DI Navigator: No conflicts detected');
                return;
            }

            // Create enhanced conflict report
            let conflictDetails = `Dependency Injection Conflicts Detected (${allConflicts.length} total):\n\n`;

            // Add lifetime conflicts
            if (lifetimeConflicts.length > 0) {
                conflictDetails += `=== LIFETIME CONFLICTS (${lifetimeConflicts.length}) ===\n\n`;
                lifetimeConflicts.forEach((conflict, index) => {
                    conflictDetails += `${index + 1}. ${conflict.serviceType} (${conflict.implementationType})\n`;
                    conflictDetails += `   Current: ${conflict.currentLifetime}, Recommended: ${conflict.recommendedLifetime}\n`;
                    conflictDetails += `   Reason: ${conflict.conflictReason}\n`;
                    conflictDetails += `   Location: ${conflict.filePath}:${conflict.lineNumber}\n`;
                    conflictDetails += `   Severity: ${conflict.severity}\n\n`;
                });
            }

            // Add legacy conflicts
            if (legacyConflicts.length > 0) {
                conflictDetails += `=== LEGACY CONFLICTS (${legacyConflicts.length}) ===\n\n`;
                legacyConflicts.forEach((service: any, index: number) => {
                    const conflict = service.conflicts?.[0];
                    conflictDetails += `${index + 1}. ${service.name}: ${conflict?.details || 'Unknown conflict'}\n`;
                });
            }

            const document = await vscode.workspace.openTextDocument({
                content: conflictDetails,
                language: 'text'
            });

            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: true
            });

            this.logger.info(`Found ${allConflicts.length} conflicts (${lifetimeConflicts.length} lifetime, ${legacyConflicts.length} legacy)`);

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
                this.treeViewManager.showServiceDetails(serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service details');
        }
    }

    navigateToServiceRegistration(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Navigate to the first registration of the service
                this.treeViewManager.navigateToFirstRegistration(serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to navigate to service registration');
        }
    }

    showServiceSummary(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Show service summary
                this.treeViewManager.showServiceSummary(serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service summary');
        }
    }

    showServiceConflicts(serviceItem: any): void {
        try {
            if (serviceItem && serviceItem.serviceData) {
                // Show service conflicts
                this.treeViewManager.showServiceConflicts(serviceItem.serviceData);
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show service conflicts');
        }
    }

    /**
     * Show validation details in output channel
     */
    private showValidationDetails(validationResult: any): void {
        const channel = vscode.window.createOutputChannel('DI Navigator - Validation');
        channel.clear();
        channel.appendLine('=== Data Validation Results ===');
        channel.appendLine(`Overall Status: ${validationResult.isValid ? '✅ Valid' : '❌ Invalid'}`);
        channel.appendLine(`Total Issues: ${validationResult.summary.totalIssues}`);
        channel.appendLine(`Errors: ${validationResult.summary.errorCount}`);
        channel.appendLine(`Warnings: ${validationResult.summary.warningCount}`);
        channel.appendLine(`Info: ${validationResult.summary.infoCount}`);
        channel.appendLine('');

        if (validationResult.issues.length > 0) {
            channel.appendLine('=== Detailed Issues ===');
            validationResult.issues.forEach((issue: any, index: number) => {
                const icon = issue.severity === 'Error' ? '❌' :
                    issue.severity === 'Warning' ? '⚠️' : 'ℹ️';
                channel.appendLine(`${index + 1}. ${icon} [${issue.severity}] ${issue.message}`);
                channel.appendLine(`   Field: ${issue.field}`);
                channel.appendLine(`   Type: ${issue.type}`);
                channel.appendLine('');
            });
        }

        channel.appendLine('====================================');
        channel.show();
    }

    /**
     * Search services by name or pattern
     */
    async searchServices(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            // Get search query from user
            const searchQuery = await vscode.window.showInputBox({
                prompt: 'Enter service name or pattern to search',
                placeHolder: 'e.g., UserService, *Service, I*',
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Search query cannot be empty';
                    }
                    return null;
                }
            });

            if (!searchQuery) {
                return; // User cancelled
            }

            // Find matching services
            const matchingServices: any[] = [];
            analysisData.projects.forEach(project => {
                project.serviceGroups.forEach(group => {
                    group.services.forEach(service => {
                        if (this.matchesSearchQuery(service.name, searchQuery)) {
                            matchingServices.push({
                                service,
                                project: project.projectName,
                                group: group.lifetime
                            });
                        }
                    });
                });
            });

            if (matchingServices.length === 0) {
                vscode.window.showInformationMessage(`No services found matching: ${searchQuery}`);
                return;
            }

            // Show results
            if (matchingServices.length === 1) {
                // Single result - navigate directly
                const result = matchingServices[0];
                this.treeViewManager.navigateToFirstRegistration(result.service);
            } else {
                // Multiple results - show quick pick
                const items = matchingServices.map(result => ({
                    label: result.service.name,
                    description: `${result.group} lifetime`,
                    detail: `Project: ${result.project}`,
                    service: result.service
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: `Found ${matchingServices.length} services matching "${searchQuery}"`,
                    matchOnDescription: true,
                    matchOnDetail: true
                });

                if (selected) {
                    this.treeViewManager.navigateToFirstRegistration(selected.service);
                }
            }

        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to search services');
        }
    }

    /**
     * Filter services by lifetime
     */
    async filterByLifetime(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            // Get available lifetimes
            const availableLifetimes = [...new Set(
                analysisData.projects.flatMap(project =>
                    project.serviceGroups.map(group => group.lifetime)
                )
            )];

            const selectedLifetime = await vscode.window.showQuickPick(
                availableLifetimes.map(lifetime => ({
                    label: lifetime,
                    description: `${analysisData.projects.flatMap(p => p.serviceGroups.find(g => g.lifetime === lifetime)?.services || []).length} services`,
                    lifetime
                })),
                {
                    placeHolder: 'Select lifetime to filter by'
                }
            );

            if (!selectedLifetime) {
                return; // User cancelled
            }

            // Filter and show services with selected lifetime
            const filteredServices: any[] = [];
            analysisData.projects.forEach(project => {
                const group = project.serviceGroups.find(g => g.lifetime === selectedLifetime.lifetime);
                if (group) {
                    filteredServices.push(...group.services.map(service => ({
                        service,
                        project: project.projectName,
                        lifetime: group.lifetime
                    })));
                }
            });

            if (filteredServices.length === 0) {
                vscode.window.showInformationMessage(`No services found with lifetime: ${selectedLifetime.lifetime}`);
                return;
            }

            // Show filtered results
            const items = filteredServices.map(result => ({
                label: result.service.name,
                description: `Project: ${result.project}`,
                detail: `${result.service.registrations.length} registrations`,
                service: result.service
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `Found ${filteredServices.length} services with ${selectedLifetime.lifetime} lifetime`,
                matchOnDescription: true
            });

            if (selected) {
                this.treeViewManager.navigateToFirstRegistration(selected.service);
            }

        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to filter services');
        }
    }

    /**
     * Show dependency graph visualization
     */
    async showDependencyGraph(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            // Generate simple dependency graph text
            let graphText = '=== Service Dependency Graph ===\n\n';

            analysisData.projects.forEach(project => {
                graphText += `Project: ${project.projectName}\n`;
                graphText += '='.repeat(50) + '\n';

                project.serviceGroups.forEach(group => {
                    graphText += `\n[${group.lifetime} Services]\n`;
                    group.services.forEach(service => {
                        graphText += `  ${service.name}\n`;

                        // Show registrations
                        service.registrations.forEach(reg => {
                            graphText += `    → Registered: ${reg.methodCall} (${reg.filePath}:${reg.lineNumber})\n`;
                        });

                        // Show injection sites
                        service.injectionSites.forEach(site => {
                            graphText += `    ← Injected in: ${site.className}.${site.memberName} (${site.filePath}:${site.lineNumber})\n`;
                        });
                    });
                });

                graphText += '\n' + '='.repeat(50) + '\n';
            });

            const document = await vscode.workspace.openTextDocument({
                content: graphText,
                language: 'text'
            });

            await vscode.window.showTextDocument(document, {
                viewColumn: vscode.ViewColumn.Beside,
                preview: true
            });

        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show dependency graph');
        }
    }

    /**
     * Export analysis results to file
     */
    async exportAnalysis(): Promise<void> {
        try {
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData) {
                vscode.window.showWarningMessage('DI Navigator: Please run analysis first');
                return;
            }

            // Get export format
            const format = await vscode.window.showQuickPick(
                [
                    { label: 'JSON', description: 'JavaScript Object Notation', format: 'json' },
                    { label: 'CSV', description: 'Comma Separated Values', format: 'csv' },
                    { label: 'XML', description: 'Extensible Markup Language', format: 'xml' }
                ],
                {
                    placeHolder: 'Select export format'
                }
            );

            if (!format) {
                return; // User cancelled
            }

            // Get save location
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(`di-analysis.${format.format}`),
                filters: {
                    'Export Files': [format.format],
                    'All Files': ['*']
                }
            });

            if (!uri) {
                return; // User cancelled
            }

            // Generate export content based on format
            let content: string;
            switch (format.format) {
                case 'json':
                    content = JSON.stringify(analysisData, null, 2);
                    break;
                case 'csv':
                    content = this.generateCsvContent(analysisData);
                    break;
                case 'xml':
                    content = this.generateXmlContent(analysisData);
                    break;
                default:
                    throw new Error(`Unsupported export format: ${format.format}`);
            }

            // Write to file
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));

            vscode.window.showInformationMessage(
                `DI Navigator: Analysis exported to ${uri.fsPath}`
            );

        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to export analysis');
        }
    }

    /**
      * Show the DI Navigator tree view
      */
    async showTreeView(): Promise<void> {
        try {
            this.logger.info('Manually showing DI Navigator tree view');

            // Validate workspace context
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showWarningMessage('DI Navigator: Please open a .NET project to use this extension.');
                return;
            }

            const currentWorkspace = workspaceFolders[0].name;
            this.logger.info(`Showing tree view for workspace: ${currentWorkspace}`);

            // Ensure the tree view is visible
            await this.treeViewManager.ensureVisible();

            // If no analysis data, show helpful message
            const analysisData = this.treeViewManager.getCurrentAnalysisData();
            if (!analysisData || analysisData.totalServices === 0) {
                const action = await vscode.window.showInformationMessage(
                    `DI Navigator: Tree view is now visible for workspace "${currentWorkspace}". Ready to analyze your .NET project!`,
                    'Analyze Project',
                    'Learn More'
                );

                if (action === 'Analyze Project') {
                    await this.analyzeProject();
                } else if (action === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse('https://github.com/chaluvadis/di-navigator'));
                }
            } else {
                vscode.window.showInformationMessage(
                    `DI Navigator: Tree view showing ${analysisData.totalServices} services from ${analysisData.totalProjects} project(s) in workspace "${currentWorkspace}"`
                );
            }
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to show tree view');
        }
    }

    /**
     * Force recreate the tree view (for troubleshooting)
     */
    async recreateTreeView(): Promise<void> {
        try {
            this.logger.info('Force recreating tree view');

            // Dispose existing tree view
            if (this.treeViewManager) {
                this.treeViewManager.dispose();
            }

            // Create new tree view manager
            const treeViewManager = new TreeViewManager(this.context, this.logger);

            // Replace the old manager
            (this as any).treeViewManager = treeViewManager;

            // Initialize it
            treeViewManager.initialize();

            // Show it
            setTimeout(() => {
                treeViewManager.ensureVisible();
            }, 500);

            vscode.window.showInformationMessage('DI Navigator: Tree view recreated successfully');
        } catch (error) {
            this.errorHandler.handleError(error, 'Failed to recreate tree view');
        }
    }

    /**
      * Find .NET solution file in the workspace directory
      * @param workspaceRoot Root directory to search in
      * @returns Path to .sln file or null if not found
      */
    private async findSolutionFile(workspaceRoot: string): Promise<string | null> {
        try {
            // List all files in the workspace root
            const files = await fs.promises.readdir(workspaceRoot);

            // Look for solution files (.sln and .slnx)
            const solutionFiles = files.filter((file: string) =>
                file.endsWith('.sln') || file.endsWith('.slnx')
            );

            if (solutionFiles.length > 0) {
                // Return the first .sln file found
                const solutionPath = path.join(workspaceRoot, solutionFiles[0]);
                this.logger.info(`Found solution file: ${solutionPath}`);
                return solutionPath;
            }

            // If no .sln file found, look for .csproj files
            const projectFiles = files.filter((file: string) => file.endsWith('.csproj'));

            if (projectFiles.length > 0) {
                // Return the first .csproj file found
                const projectPath = path.join(workspaceRoot, projectFiles[0]);
                this.logger.info(`Found project file: ${projectPath}`);
                return projectPath;
            }

            this.logger.warn('No .NET solution (.sln, .slnx) or project (.csproj) files found in workspace');
            return null;

        } catch (error) {
            this.logger.error('Error finding solution file', 'DINavigatorExtension', error);
            return null;
        }
    }

    /**
      * Check if service name matches search query
      */
    private matchesSearchQuery(serviceName: string, query: string): boolean {
        const normalizedQuery = query.trim().toLowerCase();

        // Handle wildcards
        if (normalizedQuery.includes('*')) {
            const regexPattern = normalizedQuery.replace(/\*/g, '.*');
            const regex = new RegExp(`^${regexPattern}$`, 'i');
            return regex.test(serviceName);
        }

        // Simple string matching
        return serviceName.toLowerCase().includes(normalizedQuery);
    }

    /**
     * Generate CSV content from analysis data
     */
    private generateCsvContent(analysisData: WorkspaceAnalysis): string {
        const lines: string[] = [];

        // Header
        lines.push('Project,Service Name,Lifetime,Registration Count,Injection Count,Has Conflicts');

        // Data rows
        analysisData.projects.forEach(project => {
            project.serviceGroups.forEach(group => {
                group.services.forEach(service => {
                    lines.push([
                        project.projectName,
                        service.name,
                        group.lifetime,
                        service.registrations.length.toString(),
                        service.injectionSites.length.toString(),
                        service.hasConflicts ? 'Yes' : 'No'
                    ].join(','));
                });
            });
        });

        return lines.join('\n');
    }

    /**
     * Generate XML content from analysis data
     */
    private generateXmlContent(analysisData: WorkspaceAnalysis): string {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<DependencyInjectionAnalysis>\n';

        analysisData.projects.forEach(project => {
            xml += `  <Project name="${project.projectName}" path="${project.projectPath}">\n`;

            project.serviceGroups.forEach(group => {
                xml += `    <ServiceGroup lifetime="${group.lifetime}">\n`;

                group.services.forEach(service => {
                    xml += `      <Service name="${service.name}" hasConflicts="${service.hasConflicts}">\n`;
                    xml += `        <Registrations count="${service.registrations.length}" />\n`;
                    xml += `        <InjectionSites count="${service.injectionSites.length}" />\n`;
                    xml += '      </Service>\n';
                });

                xml += '    </ServiceGroup>\n';
            });

            xml += '  </Project>\n';
        });

        xml += '</DependencyInjectionAnalysis>';
        return xml;
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