import * as vscode from 'vscode';
import { Logger } from './Logger';
import { WorkspaceAnalysis } from './models';

export class TreeViewManager {
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;
    private treeDataProvider: DINavigatorTreeProvider | null = null;
    private treeView: vscode.TreeView<DINavigatorTreeItem> | null = null;
    private currentAnalysisData: WorkspaceAnalysis | null = null;
    private currentWorkspaceFolder: string | null = null;
    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
        this.updateCurrentWorkspace();
    }
    public getServiceIcon(lifetime: string): string {
        let lt = lifetime?.trim() || 'Others';
        switch (lt) {
            case 'Singleton':
                return 'symbol-class'; // Represents the application/service class
            case 'Scoped':
                return 'symbol-interface'; // Represents the contract/interface being implemented
            case 'Transient':
                return 'symbol-method'; // Represents the factory method pattern often used
            case 'Others':
                return 'symbol-property'; // Represents miscellaneous services (configuration, hosted services, etc.)
            default:
                return 'symbol-property';
        }
    }
    private updateCurrentWorkspace(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const newWorkspaceFolder = workspaceFolders[0].uri.fsPath;

            // Check if workspace actually changed
            if (this.currentWorkspaceFolder !== newWorkspaceFolder) {
                const previousWorkspace = this.currentWorkspaceFolder;
                this.currentWorkspaceFolder = newWorkspaceFolder;
                this.logger.info(`Workspace changed from: ${previousWorkspace} to: ${this.currentWorkspaceFolder}`);

                // Load data for new workspace
                this.loadWorkspaceData();
            } else {
                this.logger.debug(`Workspace context updated: ${this.currentWorkspaceFolder}`);
            }
        } else {
            this.currentWorkspaceFolder = null;
            this.logger.warn('No workspace folder available');
            this.clear();
        }
    }
    private loadWorkspaceData(): void {
        if (!this.currentWorkspaceFolder) {
            this.clear();
            return;
        }
        const storedData = this.loadAnalysisDataFromStorage();
        if (storedData) {
            this.currentAnalysisData = storedData;
            this.treeDataProvider?.updateAnalysisData(storedData);
            this.logger.info(`Loaded workspace data: ${storedData.totalServices} services from ${storedData.totalProjects} projects`);
        } else {
            this.clear();
            this.logger.info(`No stored data found for workspace: ${this.currentWorkspaceFolder}`);
        }
    }

    initialize(): void {
        this.logger.info('Initializing TreeViewManager...');
        try {
            // Create tree data provider
            this.treeDataProvider = new DINavigatorTreeProvider(this.logger, this);
            this.logger.info('Tree data provider created', 'TreeViewManager');

            // Register tree view
            this.treeView = vscode.window.createTreeView('di-navigator-tree-view', {
                treeDataProvider: this.treeDataProvider,
                showCollapseAll: true,
                canSelectMany: false
            });

            this.logger.info('Tree view created successfully', 'TreeViewManager', {
                viewId: 'di-navigator-tree-view',
                hasProvider: !!this.treeDataProvider,
                hasView: !!this.treeView
            });

            // Handle tree item selection
            this.treeView.onDidChangeSelection((event) => {
                this.handleTreeSelection(event.selection);
            });

            // Handle tree item expansion
            this.treeView.onDidExpandElement((event) => {
                this.logger.debug(`Expanded tree item: ${event.element.label}`, 'TreeViewManager');
            });

            // Handle tree item collapse
            this.treeView.onDidCollapseElement((event) => {
                this.logger.debug(`Collapsed tree item: ${event.element.label}`, 'TreeViewManager');
            });

            // Set initial tree data to show welcome message
            this.treeDataProvider.updateAnalysisData({
                projects: [],
                totalServices: 0,
                totalProjects: 0,
                analysisTimestamp: new Date()
            });
            // Force refresh to ensure tree view displays
            this.treeDataProvider.refresh();
            this.logger.info('TreeViewManager initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize TreeViewManager', 'TreeViewManager', error);
            throw error;
        }
    }
    updateAnalysisData(analysisData: WorkspaceAnalysis): void {
        // Validate workspace context before updating data
        this.updateCurrentWorkspace();

        if (!this.currentWorkspaceFolder) {
            this.logger.warn('Cannot update analysis data: no workspace folder available');
            vscode.window.showWarningMessage('DI Navigator: No workspace folder available. Please open a .NET project.');
            return;
        }

        this.logger.info('TreeViewManager.updateAnalysisData called', 'TreeViewManager', {
            hasData: !!analysisData,
            projectsCount: analysisData?.projects?.length || 0,
            totalServices: analysisData?.totalServices || 0,
            totalProjects: analysisData?.totalProjects || 0,
            currentWorkspace: this.currentWorkspaceFolder
        });

        // Validate that the analysis data belongs to the current workspace
        if (analysisData.projects && analysisData.projects.length > 0) {
            const analysisWorkspace = analysisData.projects[0].projectPath;
            if (!analysisWorkspace.includes(this.currentWorkspaceFolder)) {
                this.logger.warn('Analysis data workspace mismatch', 'TreeViewManager', {
                    analysisWorkspace,
                    currentWorkspace: this.currentWorkspaceFolder
                });
                vscode.window.showWarningMessage('DI Navigator: Analysis data does not match current workspace. Please re-analyze the current project.');
                return;
            }
        }

        this.currentAnalysisData = analysisData;
        this.treeDataProvider?.updateAnalysisData(analysisData);

        // Save to workspace-specific storage
        this.saveAnalysisDataToStorage();

        // Log essential summary instead of verbose structure
        this.logger.info('Analysis data updated successfully', 'TreeViewManager', {
            totalServices: analysisData.totalServices,
            totalProjects: analysisData.totalProjects,
            workspace: this.currentWorkspaceFolder
        });

        this.logger.info('Tree view data updated', 'TreeViewManager', {
            serviceCount: analysisData.totalServices,
            projectCount: analysisData.totalProjects,
            workspace: this.currentWorkspaceFolder
        });
    }
    getCurrentAnalysisData(): WorkspaceAnalysis | null {
        return this.currentAnalysisData;
    }
    refresh(): void {
        this.treeDataProvider?.refresh();
        this.logger.debug('Tree view refreshed', 'TreeViewManager');
    }
    async ensureVisible(): Promise<void> {
        if (this.treeView) {
            await vscode.commands.executeCommand('workbench.view.explorer');
            await vscode.commands.executeCommand('di-navigator-tree-view.focus');
            this.logger.info('Tree view visibility ensured', 'TreeViewManager');
        } else {
            this.logger.warn('Tree view not initialized, cannot ensure visibility', 'TreeViewManager');
        }
    }
    clear(): void {
        this.currentAnalysisData = null;
        this.treeDataProvider?.refresh();
        if (this.currentWorkspaceFolder) {
            const storageKey = this.getWorkspaceStorageKey();
            this.context.workspaceState.update(storageKey, undefined);
        }
        this.logger.info('Tree view cleared', 'TreeViewManager');
    }
    private getWorkspaceStorageKey(): string {
        if (!this.currentWorkspaceFolder) {
            return 'di-navigator-analysis-data';
        }
        // Create a hash of the workspace path for storage key
        const workspaceHash = require('crypto').createHash('md5').update(this.currentWorkspaceFolder).digest('hex');
        return `di-navigator-analysis-data-${workspaceHash}`;
    }
    private saveAnalysisDataToStorage(): void {
        if (!this.currentWorkspaceFolder || !this.currentAnalysisData) {
            return;
        }

        try {
            const storageKey = this.getWorkspaceStorageKey();
            const dataToStore = {
                workspaceFolder: this.currentWorkspaceFolder,
                analysisData: this.currentAnalysisData,
                timestamp: Date.now()
            };

            this.context.workspaceState.update(storageKey, dataToStore);
            this.logger.info(`Analysis data saved for workspace: ${this.currentWorkspaceFolder}`);
        } catch (error) {
            this.logger.error('Failed to save analysis data to storage', 'TreeViewManager', error);
        }
    }
    private loadAnalysisDataFromStorage(): WorkspaceAnalysis | null {
        if (!this.currentWorkspaceFolder) {
            return null;
        }

        try {
            const storageKey = this.getWorkspaceStorageKey();
            const storedData = this.context.workspaceState.get(storageKey) as any;

            if (storedData && storedData.workspaceFolder === this.currentWorkspaceFolder) {
                this.logger.info(`Analysis data loaded for workspace: ${this.currentWorkspaceFolder}`);
                return storedData.analysisData;
            }
        } catch (error) {
            this.logger.error('Failed to load analysis data from storage', 'TreeViewManager', error);
        }

        return null;
    }
    private handleTreeSelection(selection: readonly DINavigatorTreeItem[]): void {
        try {
            if (selection.length === 0) {
                this.logger.debug('No items selected', 'TreeViewManager');
                return;
            }

            const selectedItem = selection[0];

            // Validate selected item
            if (!selectedItem) {
                this.logger.warn('Selected item is null or undefined', 'TreeViewManager');
                return;
            }

            this.logger.debug(`Tree item selected: ${selectedItem.label}`, 'TreeViewManager', {
                type: selectedItem.itemType,
                contextValue: selectedItem.contextValue,
                hasData: !!(selectedItem.projectData || selectedItem.serviceData || selectedItem.registrationData || selectedItem.injectionSiteData)
            });

            // Handle different types of tree items
            switch (selectedItem.itemType) {
                case 'project':
                    this.handleProjectSelection(selectedItem);
                    break;
                case 'service':
                    this.handleServiceSelection(selectedItem);
                    break;
                case 'registration':
                    this.handleRegistrationSelection(selectedItem);
                    break;
                case 'injection-site':
                    this.handleInjectionSiteSelection(selectedItem);
                    break;
                case 'info':
                    this.handleInfoSelection(selectedItem);
                    break;
                default:
                    this.logger.debug(`Unhandled selection type: ${selectedItem.itemType}`, 'TreeViewManager');
            }
        } catch (error) {
            this.logger.error('Error handling tree selection', 'TreeViewManager', error);
        }
    }
    private handleInfoSelection(item: DINavigatorTreeItem): void {
        try {
            const label = typeof item.label === 'string' ? item.label : item.label?.label || 'Unknown';
            this.logger.debug(`Info item selected: ${label}`, 'TreeViewManager');

            // Show helpful information based on the info item
            if (label.includes('Run "DI Navigator: Analyze Project"')) {
                // Offer to run analysis
                vscode.window.showInformationMessage(
                    'Ready to analyze your .NET project?',
                    'Analyze Now',
                    'Learn More'
                ).then(action => {
                    if (action === 'Analyze Now') {
                        vscode.commands.executeCommand('di-navigator.analyzeProject');
                    } else if (action === 'Learn More') {
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/chaluvadis/di-navigator'));
                    }
                });
            }
        } catch (error) {
            this.logger.error('Error handling info selection', 'TreeViewManager', error);
        }
    }
    private handleProjectSelection(item: DINavigatorTreeItem): void {
        try {
            if (!item.projectData) {
                this.logger.warn('No project data available for selected item', 'TreeViewManager');
                return;
            }

            const project = item.projectData;
            const totalServices = project.serviceGroups?.reduce((acc: number, group: any) => acc + group.services.length, 0) || 0;
            const groupCount = project.serviceGroups?.length || 0;

            this.logger.debug(`Project selected: ${project.projectName}`, 'TreeViewManager', {
                totalServices,
                groupCount,
                projectPath: project.projectPath
            });

            // Show project summary in output channel
            this.showProjectSummary(project);
        } catch (error) {
            this.logger.error('Error handling project selection', 'TreeViewManager', error);
        }
    }
    private handleServiceSelection(item: DINavigatorTreeItem): void {
        try {
            if (!item.serviceData) {
                this.logger.warn('No service data available for selected item', 'TreeViewManager');
                vscode.window.showWarningMessage('No service data available for selected item');
                return;
            }

            const service = item.serviceData;
            this.logger.debug(`Service selected: ${service.name}`, 'TreeViewManager', {
                registrationCount: service.registrations?.length || 0,
                injectionCount: service.injectionSites?.length || 0
            });

            // Navigate directly to the first registration instead of showing options menu
            this.navigateToFirstRegistration(service);
        } catch (error) {
            this.logger.error('Error handling service selection', 'TreeViewManager', error);
            vscode.window.showErrorMessage('Error handling service selection');
        }
    }
    public async showServiceDetails(service: any): Promise<void> {
        const registrations = service.registrations
            .map((r: any, i: number) => {
                let cleanMethodCall = r.methodCall || 'Unknown';

                // Enhanced cleanup for complex expressions
                if (cleanMethodCall.includes('=>') || cleanMethodCall.includes('=') || cleanMethodCall.includes('(')) {
                    const methodNameMatch = cleanMethodCall.match(/^(\w+)\s*\(/);
                    if (methodNameMatch) {
                        cleanMethodCall = methodNameMatch[1];
                    }
                }

                // Additional cleanup for cases like "builder.Configuration" or "FactoryMethod"
                if (cleanMethodCall.includes('.') || cleanMethodCall === 'FactoryMethod') {
                    const parts = cleanMethodCall.split('.');
                    if (parts.length > 1) {
                        cleanMethodCall = parts[parts.length - 1];
                    }
                }

                // Final validation - ensure we have a clean method name
                if (!cleanMethodCall || cleanMethodCall === 'Unknown' || cleanMethodCall === 'FactoryMethod') {
                    const fallbackMatch = (r.methodCall || '').match(/(\w+)\s*\(/);
                    if (fallbackMatch) {
                        cleanMethodCall = fallbackMatch[1];
                    }
                }

                return `  ${i + 1}. ${cleanMethodCall} (${r.filePath}:${r.lineNumber})`;
            })
            .join('\n');

        const injectionSites = service.injectionSites
            .map((site: any, i: number) => `  ${i + 1}. ${site.className}.${site.memberName} (${site.filePath}:${site.lineNumber})`)
            .join('\n');

        const details = `
            Service: ${service.name}
            Lifetime: ${service.registrations[0]?.lifetime || 'Unknown'}
            Registrations: ${service.registrations.length}
            Injection Sites: ${service.injectionSites.length}
            Registrations: ${registrations || '  None found'}
            Injection Sites: ${injectionSites || '  None found'}
        `.trim();

        const document = await vscode.workspace.openTextDocument({
            content: details,
            language: 'text'
        });

        await vscode.window.showTextDocument(document, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: true,
            preserveFocus: true
        });
    }

    /**
     * Navigate to the first registration of the service (Public method for command handlers)
     * @param service Service data
     */
    public async navigateToFirstRegistration(service: any): Promise<void> {
        if (service.registrations.length === 0) {
            vscode.window.showWarningMessage(`No registrations found for service: ${service.name}`);
            return;
        }

        const registration = service.registrations[0];
        await this.navigateToLocation(registration.filePath, registration.lineNumber);
    }

    /**
     * Show project summary in output channel
     * @param project Project data
     */
    private showProjectSummary(project: any): void {
        const channel = vscode.window.createOutputChannel('DI Navigator');
        channel.clear();
        channel.appendLine(`=== Project Summary: ${project.projectName} ===`);
        channel.appendLine(`Path: ${project.projectPath}`);

        const totalServices = project.serviceGroups.reduce((acc: number, group: any) => acc + group.services.length, 0);
        const groupCount = project.serviceGroups.length;

        channel.appendLine(`Total Services: ${totalServices}`);
        channel.appendLine(`Service Groups: ${groupCount}`);

        project.serviceGroups.forEach((group: any) => {
            const serviceCount = group.services.length;
            channel.appendLine(`  ${group.lifetime}: ${serviceCount} services`);
        });

        channel.appendLine(`====================================`);
        channel.show();
    }

    /**
     * Handle registration selection
     * @param item Selected registration item
     */
    private handleRegistrationSelection(item: DINavigatorTreeItem): void {
        try {
            if (item.registrationData) {
                const methodCall = item.registrationData.methodCall || 'Unknown';
                this.logger.debug(`Registration selected: ${methodCall}`, 'TreeViewManager', {
                    filePath: item.registrationData.filePath,
                    lineNumber: item.registrationData.lineNumber
                });

                this.navigateToLocation(item.registrationData.filePath, item.registrationData.lineNumber);
            } else {
                this.logger.warn('No registration data available for selected registration item', 'TreeViewManager');
                vscode.window.showWarningMessage('No registration data available for selected item');
            }
        } catch (error) {
            this.logger.error('Error handling registration selection', 'TreeViewManager', error);
            vscode.window.showErrorMessage('Error navigating to registration location');
        }
    }

    /**
     * Handle injection site selection
     * @param item Selected injection site item
     */
    private handleInjectionSiteSelection(item: DINavigatorTreeItem): void {
        try {
            if (item.injectionSiteData) {
                this.logger.debug(`Injection site selected: ${item.injectionSiteData.className}.${item.injectionSiteData.memberName}`, 'TreeViewManager', {
                    filePath: item.injectionSiteData.filePath,
                    lineNumber: item.injectionSiteData.lineNumber
                });

                this.navigateToLocation(item.injectionSiteData.filePath, item.injectionSiteData.lineNumber);
            } else {
                this.logger.warn('No injection site data available for selected item', 'TreeViewManager');
                vscode.window.showWarningMessage('No injection site data available for selected item');
            }
        } catch (error) {
            this.logger.error('Error handling injection site selection', 'TreeViewManager', error);
            vscode.window.showErrorMessage('Error navigating to injection site location');
        }
    }

    /**
     * Navigate to a specific location in a file
     * @param filePath File path
     * @param lineNumber Line number (1-based)
     */
    private async navigateToLocation(filePath: string, lineNumber: number): Promise<void> {
        try {
            // Validate inputs
            if (!filePath || typeof filePath !== 'string') {
                throw new Error('Invalid file path provided');
            }

            if (!lineNumber || typeof lineNumber !== 'number' || lineNumber < 1) {
                throw new Error('Invalid line number provided');
            }

            // Check if file exists
            const fileExists = await this.fileExists(filePath);
            if (!fileExists) {
                throw new Error(`File does not exist: ${filePath}`);
            }

            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            const position = new vscode.Position(Math.max(0, lineNumber - 1), 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

            this.logger.debug(`Navigated to: ${filePath}:${lineNumber}`, 'TreeViewManager');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
                `Failed to navigate to location: ${filePath}:${lineNumber} - ${errorMessage}`,
                'TreeViewManager',
                error
            );

            // Show user-friendly error message
            vscode.window.showErrorMessage(
                `Cannot navigate to ${filePath}:${lineNumber} - ${errorMessage}`
            );
        }
    }

    /**
     * Check if a file exists
     * @param filePath Path to check
     * @returns Promise<boolean> indicating if file exists
     */
    private async fileExists(filePath: string): Promise<boolean> {
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
            return true;
        } catch {
            return false;
        }
    }


    /**
     * Dispose of the tree view manager
     */
    dispose(): void {
        this.logger.info('Disposing TreeViewManager...');

        if (this.treeView) {
            this.treeView.dispose();
            this.treeView = null;
        }

        this.treeDataProvider = null;
        this.currentAnalysisData = null;

        this.logger.info('TreeViewManager disposed');
    }
}

/**
 * Tree Data Provider for DI Navigator
 */
class DINavigatorTreeProvider implements vscode.TreeDataProvider<DINavigatorTreeItem> {
    private readonly logger: Logger;
    private readonly treeViewManager: TreeViewManager;
    private analysisData: WorkspaceAnalysis | null = null;
    private onDidChangeTreeDataEmitter = new vscode.EventEmitter<DINavigatorTreeItem | undefined | null>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    constructor(logger: Logger, treeViewManager: TreeViewManager) {
        this.logger = logger;
        this.treeViewManager = treeViewManager;
    }
    getTreeItem(element: DINavigatorTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for the given element
     * @param element Parent element or null for root
     * @returns Array of child tree items
     */
    getChildren(element?: DINavigatorTreeItem): Thenable<DINavigatorTreeItem[]> {
        try {
            if (!element) {
                // Root level - return service groups
                return Promise.resolve(this.getRootItems());
            }

            switch (element.itemType) {
                case 'project':
                    return Promise.resolve(this.getServiceGroups(element));
                case 'group':
                    return Promise.resolve(this.getServiceItems(element));
                case 'service':
                    return Promise.resolve(this.getRegistrationAndInjectionItems(element));
                case 'info':
                    return Promise.resolve([]); // Info items are leaf nodes
                default:
                    this.logger.debug(`Unknown element type: ${element.itemType}`, 'DINavigatorTreeProvider');
                    return Promise.resolve([]);
            }
        } catch (error) {
            this.logger.error('Error getting tree children', 'DINavigatorTreeProvider', error);
            return Promise.resolve([]);
        }
    }

    /**
     * Get root level items (projects)
     * @returns Array of project items
     */
    private getRootItems(): DINavigatorTreeItem[] {
        try {
            this.logger.debug('getRootItems called', 'DINavigatorTreeProvider', {
                hasAnalysisData: !!this.analysisData,
                projectsCount: this.analysisData?.projects?.length || 0
            });

            if (!this.analysisData) {
                this.logger.debug('No analysis data available, returning welcome items', 'DINavigatorTreeProvider');
                return [
                    new DINavigatorTreeItem(
                        'DI Navigator',
                        'Ready to analyze .NET dependency injection',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    ),
                    new DINavigatorTreeItem(
                        'Run "DI Navigator: Analyze Project" to get started',
                        'Execute analysis from the command palette or right-click on .csproj/.sln files',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    )
                ];
            }

            if (!this.analysisData.projects || this.analysisData.projects.length === 0) {
                this.logger.debug('No projects in analysis data, returning info items', 'DINavigatorTreeProvider');
                return [
                    new DINavigatorTreeItem(
                        'No projects found',
                        'Open a .NET project to see analysis results',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    ),
                    new DINavigatorTreeItem(
                        'Run analysis to populate this view',
                        'Use the "Analyze Project" command to start',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    )
                ];
            }

            const items = this.analysisData.projects.map((project, index) => {
                try {
                    const totalServices = project.serviceGroups?.reduce((acc: number, group: any) => acc + group.services.length, 0) || 0;
                    const label = `${project.projectName} (${totalServices} services)`;

                    this.logger.debug(`${index} Creating project item: ${label}`, 'DINavigatorTreeProvider', {
                        projectName: project.projectName,
                        totalServices,
                        serviceGroupsCount: project.serviceGroups?.length || 0
                    });

                    return new DINavigatorTreeItem(
                        label,
                        `Project: ${project.projectPath}`,
                        'project',
                        totalServices > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        project  // projectData
                    );
                } catch (error) {
                    this.logger.error(`Error creating project item for ${project.projectName}`, 'DINavigatorTreeProvider', error);
                    return new DINavigatorTreeItem(
                        `Error: ${project.projectName}`,
                        'Error loading project data',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    );
                }
            });

            this.logger.debug(`Returning ${items.length} root items`, 'DINavigatorTreeProvider');
            return items;
        } catch (error) {
            this.logger.error('Error getting root items', 'DINavigatorTreeProvider', error);
            return [
                new DINavigatorTreeItem(
                    'Error loading DI Navigator',
                    'An error occurred while loading the tree view',
                    'info',
                    vscode.TreeItemCollapsibleState.None
                )
            ];
        }
    }

    /**
     * Get service groups for a project
     * @param projectItem Project tree item
     * @returns Array of service group items
     */
    private getServiceGroups(projectItem: DINavigatorTreeItem): DINavigatorTreeItem[] {
        try {
            const project = projectItem.projectData;
            if (!project) {
                this.logger.warn('No project data available', 'DINavigatorTreeProvider');
                return [];
            }

            if (!project.serviceGroups || !Array.isArray(project.serviceGroups)) {
                this.logger.warn('No service groups available in project', 'DINavigatorTreeProvider');
                return [];
            }

            // Sort service groups by lifetime priority
            const lifetimeOrder = { 'Scoped': 0, 'Singleton': 1, 'Transient': 2, 'Others': 3 };
            const sortedGroups = project.serviceGroups.sort((a: any, b: any) => {
                const orderA = lifetimeOrder[a.lifetime as keyof typeof lifetimeOrder] ?? 999;
                const orderB = lifetimeOrder[b.lifetime as keyof typeof lifetimeOrder] ?? 999;
                return orderA - orderB;
            });

            return sortedGroups.map((group: any) => {
                try {
                    const serviceCount = group.services?.length || 0;
                    const label = `${group.lifetime} (${serviceCount})`;

                    console.debug(`TreeView: Creating group "${label}" with lifetime "${group.lifetime}"`);

                    this.logger.debug(`Creating service group item: ${label}`, 'DINavigatorTreeProvider', {
                        lifetime: group.lifetime,
                        serviceCount
                    });

                    return new DINavigatorTreeItem(
                        label,
                        `Service group with ${serviceCount} services`,
                        'group',
                        serviceCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                        undefined,  // projectData
                        group       // groupData
                    );
                } catch (error) {
                    this.logger.error('Error creating service group item', 'DINavigatorTreeProvider', error);
                    return new DINavigatorTreeItem(
                        'Error loading group',
                        'Error loading service group data',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    );
                }
            });
        } catch (error) {
            this.logger.error('Error getting service groups', 'DINavigatorTreeProvider', error);
            return [];
        }
    }

    /**
     * Get service items for a group
     * @param groupItem Group tree item
     * @returns Array of service items
     */
    private getServiceItems(groupItem: DINavigatorTreeItem): DINavigatorTreeItem[] {
        try {
            const group = groupItem.groupData;
            if (!group) {
                this.logger.warn('No group data available', 'DINavigatorTreeProvider');
                return [];
            }

            if (!group.services || !Array.isArray(group.services)) {
                this.logger.warn('No services available in group', 'DINavigatorTreeProvider');
                return [];
            }

            // Sort services alphabetically by name
            const sortedServices = group.services.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

            return sortedServices.map((service: any) => {
                try {
                    const registrationCount = service.registrations?.length || 0;
                    const injectionCount = service.injectionSites?.length || 0;

                    let description = '';
                    if (registrationCount > 0) {
                        description += `${registrationCount} reg${registrationCount > 1 ? 's' : ''}`;
                    }
                    if (injectionCount > 0) {
                        if (description) { description += ', '; }
                        description += `${injectionCount} injection${injectionCount > 1 ? 's' : ''}`;
                    }

                    const collapsibleState = (registrationCount > 0 || injectionCount > 0)
                        ? vscode.TreeItemCollapsibleState.Collapsed
                        : vscode.TreeItemCollapsibleState.None;

                    const lifetime = service.registrations?.[0]?.lifetime || 'Others';
                    const icon = this.treeViewManager.getServiceIcon(lifetime);

                    console.debug(`TreeView: Service "${service.name}" has lifetime "${lifetime}"`);

                    const treeItem = new DINavigatorTreeItem(
                        service.name || 'Unknown Service',
                        description,
                        'service',
                        collapsibleState,
                        undefined,  // projectData
                        undefined,  // groupData
                        service     // serviceData
                    );

                    treeItem.iconPath = new vscode.ThemeIcon(icon);

                    // Log the service with its assigned symbol
                    this.logger.debug(`Service created: ${service.name} [${icon}] (${lifetime})`, 'DINavigatorTreeProvider', {
                        registrations: registrationCount,
                        injections: injectionCount
                    });

                    return treeItem;
                } catch (error) {
                    this.logger.error('Error creating service item', 'DINavigatorTreeProvider', error);
                    return new DINavigatorTreeItem(
                        'Error loading service',
                        'Error loading service data',
                        'info',
                        vscode.TreeItemCollapsibleState.None
                    );
                }
            });
        } catch (error) {
            this.logger.error('Error getting service items', 'DINavigatorTreeProvider', error);
            return [];
        }
    }

    /**
     * Get registration and injection items for a service
     * @param serviceItem Service tree item
     * @returns Array of registration and injection items
     */
    private getRegistrationAndInjectionItems(serviceItem: DINavigatorTreeItem): DINavigatorTreeItem[] {
        try {
            const service = serviceItem.serviceData;
            if (!service) {
                this.logger.warn('No service data available', 'DINavigatorTreeProvider');
                return [];
            }

            const items: DINavigatorTreeItem[] = [];

            // Add registration items
            if (service.registrations && Array.isArray(service.registrations)) {
                service.registrations.forEach((registration: any) => {
                    try {
                        // Create a more descriptive label showing service type and implementation type
                        const serviceType = registration.serviceType || service.name || 'Unknown';
                        const implementationType = registration.implementationType || 'Unknown';
                        const methodCall = registration.methodCall || 'Unknown';

                        // For factory methods, show the service type and implementation type
                        let label = `Registration: ${serviceType}`;
                        if (implementationType && implementationType !== serviceType && implementationType !== 'FactoryMethod') {
                            label += ` → ${implementationType}`;
                        }

                        const tooltip = `${methodCall} in ${registration.filePath || 'Unknown'}:${registration.lineNumber || 0}`;

                        items.push(new DINavigatorTreeItem(
                            label,
                            tooltip,
                            'registration',
                            vscode.TreeItemCollapsibleState.None,
                            undefined,  // projectData
                            undefined,  // groupData
                            undefined,  // serviceData
                            registration  // registrationData
                        ));
                    } catch (error) {
                        this.logger.error('Error creating registration item', 'DINavigatorTreeProvider', error);
                    }
                });
            }

            // Add injection site items
            if (service.injectionSites && Array.isArray(service.injectionSites)) {
                service.injectionSites.forEach((site: any, index: number) => {
                    try {
                        const label = `Injection ${index + 1}: ${site.className || 'Unknown'}.${site.memberName || 'Unknown'}`;
                        const tooltip = `${site.filePath || 'Unknown'}:${site.lineNumber || 0}`;

                        items.push(new DINavigatorTreeItem(
                            label,
                            tooltip,
                            'injection-site',
                            vscode.TreeItemCollapsibleState.None,
                            undefined,  // projectData
                            undefined,  // groupData
                            undefined,  // serviceData
                            undefined,  // registrationData
                            site        // injectionSiteData
                        ));
                    } catch (error) {
                        this.logger.error('Error creating injection site item', 'DINavigatorTreeProvider', error);
                    }
                });
            }

            return items;
        } catch (error) {
            this.logger.error('Error getting registration and injection items', 'DINavigatorTreeProvider', error);
            return [];
        }
    }

    /**
     * Refresh the tree data
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire(null);
    }

    /**
     * Update analysis data
     * @param data New analysis data
     */
    updateAnalysisData(data: WorkspaceAnalysis): void {
        this.analysisData = data;
        this.refresh();
    }
}

/**
 * Tree Item for DI Navigator
 */
export class DINavigatorTreeItem extends vscode.TreeItem {
    public readonly itemType: 'info' | 'project' | 'group' | 'service' | 'registration' | 'injection-site';
    public readonly projectData?: any;
    public readonly groupData?: any;
    public readonly serviceData?: any;
    public readonly registrationData?: any;
    public readonly injectionSiteData?: any;

    constructor(
        label: string,
        tooltip: string,
        itemType: DINavigatorTreeItem['itemType'],
        collapsibleState: vscode.TreeItemCollapsibleState,
        projectData?: any,
        groupData?: any,
        serviceData?: any,
        registrationData?: any,
        injectionSiteData?: any
    ) {
        super(label, collapsibleState);

        this.itemType = itemType;
        this.tooltip = tooltip;
        this.projectData = projectData;
        this.groupData = groupData;
        this.serviceData = serviceData;
        this.registrationData = registrationData;
        this.injectionSiteData = injectionSiteData;

        // Set context value for menu contributions
        this.contextValue = itemType;
    }
}