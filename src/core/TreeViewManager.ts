import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ProjectDI } from '../models';

/**
 * Tree View Manager Service
 *
 * Manages the VSCode tree view for displaying dependency injection analysis results.
 * Handles tree data provider registration, data updates, and user interactions.
 */
export class TreeViewManager {
    private readonly context: vscode.ExtensionContext;
    private readonly logger: Logger;
    private treeDataProvider: DINavigatorTreeProvider | null = null;
    private treeView: vscode.TreeView<DINavigatorTreeItem> | null = null;
    private currentAnalysisData: ProjectDI | null = null;

    constructor(context: vscode.ExtensionContext, logger: Logger) {
        this.context = context;
        this.logger = logger;
    }

    /**
     * Initialize the tree view manager
     */
    initialize(): void {
        this.logger.info('Initializing TreeViewManager...');

        // Create tree data provider
        this.treeDataProvider = new DINavigatorTreeProvider(this.logger);
        // Register tree view
        this.treeView = vscode.window.createTreeView('diNavigator', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true,
            canSelectMany: false
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

        this.logger.info('TreeViewManager initialized successfully');
    }

    /**
      * Update the analysis data displayed in the tree view
      * @param analysisData New analysis data
      */
    updateAnalysisData(analysisData: ProjectDI): void {
        this.logger.info('TreeViewManager.updateAnalysisData called', 'TreeViewManager', {
            hasData: !!analysisData,
            serviceGroupsCount: analysisData?.serviceGroups?.length || 0,
            totalServices: analysisData?.serviceGroups?.reduce((acc, group) => acc + group.services.length, 0) || 0
        });

        this.currentAnalysisData = analysisData;
        this.treeDataProvider?.updateAnalysisData(analysisData);

        const serviceCount = analysisData.serviceGroups.reduce((acc, group) => acc + group.services.length, 0);
        const groupCount = analysisData.serviceGroups.length;

        this.logger.info('Tree view data updated', 'TreeViewManager', {
            serviceCount,
            groupCount
        });
    }

    /**
     * Get the current analysis data
     * @returns Current analysis data or null
     */
    getCurrentAnalysisData(): ProjectDI | null {
        return this.currentAnalysisData;
    }

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this.treeDataProvider?.refresh();
        this.logger.debug('Tree view refreshed', 'TreeViewManager');
    }

    /**
     * Clear the tree view data
     */
    clear(): void {
        this.currentAnalysisData = null;
        this.treeDataProvider?.refresh();
        this.logger.info('Tree view cleared', 'TreeViewManager');
    }

    /**
     * Handle tree item selection
     * @param selection Selected tree items
     */
    private handleTreeSelection(selection: readonly DINavigatorTreeItem[]): void {
        if (selection.length === 0) {
            return;
        }

        const selectedItem = selection[0];
        this.logger.debug(`Tree item selected: ${selectedItem.label}`, 'TreeViewManager', {
            type: selectedItem.itemType,
            contextValue: selectedItem.contextValue
        });

        // Handle different types of tree items
        switch (selectedItem.itemType) {
            case 'service':
                this.handleServiceSelection(selectedItem);
                break;
            case 'registration':
                this.handleRegistrationSelection(selectedItem);
                break;
            case 'injection-site':
                this.handleInjectionSiteSelection(selectedItem);
                break;
            default:
                this.logger.debug(`Unhandled selection type: ${selectedItem.itemType}`, 'TreeViewManager');
        }
    }

    /**
     * Handle service selection
     * @param item Selected service item
     */
    private handleServiceSelection(item: DINavigatorTreeItem): void {
        if (!item.serviceData) {
            this.logger.warn('No service data available for selected item', 'TreeViewManager');
            return;
        }

        const service = item.serviceData;
        this.logger.debug(`Service selected: ${service.name}`, 'TreeViewManager', {
            registrationCount: service.registrations.length,
            injectionCount: service.injectionSites.length,
            hasConflicts: service.hasConflicts
        });

        // Show service details in a quick pick menu with options
        this.showServiceQuickPick(service);
    }

    /**
     * Show service options in a quick pick menu
     * @param service Service data
     */
    private async showServiceQuickPick(service: any): Promise<void> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(eye) View Details',
                description: 'Show detailed service information',
                detail: `View registrations, injection sites, and conflicts for ${service.name}`
            },
            {
                label: '$(arrow-right) Go to Registration',
                description: 'Navigate to service registration',
                detail: service.registrations.length > 0 ? 'Jump to the first registration location' : 'No registrations found'
            },
            {
                label: '$(info) Show Summary',
                description: 'Display service summary in output',
                detail: `${service.registrations.length} registrations, ${service.injectionSites.length} injection sites`
            }
        ];

        // Add conflict indicator if service has conflicts
        if (service.hasConflicts) {
            items.push({
                label: '$(warning) View Conflicts',
                description: 'Show service conflicts',
                detail: 'Display dependency injection conflicts for this service'
            });
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Actions for ${service.name}`,
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) {
            return; // User cancelled
        }

        switch (selected.label) {
            case '$(eye) View Details':
                this.showServiceDetails(service);
                break;
            case '$(arrow-right) Go to Registration':
                this.navigateToFirstRegistration(service);
                break;
            case '$(info) Show Summary':
                this.showServiceSummary(service);
                break;
            case '$(warning) View Conflicts':
                this.showServiceConflicts(service);
                break;
        }
    }

    /**
     * Show detailed service information
     * @param service Service data
     */
    private async showServiceDetails(service: any): Promise<void> {
        const registrations = service.registrations
            .map((r: any, i: number) => `  ${i + 1}. ${r.methodCall} (${r.filePath}:${r.lineNumber})`)
            .join('\n');

        const injectionSites = service.injectionSites
            .map((site: any, i: number) => `  ${i + 1}. ${site.className}.${site.memberName} (${site.filePath}:${site.lineNumber})`)
            .join('\n');

        const details = `
Service: ${service.name}
Lifetime: ${service.registrations[0]?.lifetime || 'Unknown'}
Registrations: ${service.registrations.length}
Injection Sites: ${service.injectionSites.length}
Conflicts: ${service.hasConflicts ? 'Yes' : 'No'}

Registrations:
${registrations || '  None found'}

Injection Sites:
${injectionSites || '  None found'}
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
     * Navigate to the first registration of the service
     * @param service Service data
     */
    private async navigateToFirstRegistration(service: any): Promise<void> {
        if (service.registrations.length === 0) {
            vscode.window.showWarningMessage(`No registrations found for service: ${service.name}`);
            return;
        }

        const registration = service.registrations[0];
        await this.navigateToLocation(registration.filePath, registration.lineNumber);
    }

    /**
     * Show service summary in output channel
     * @param service Service data
     */
    private showServiceSummary(service: any): void {
        const channel = vscode.window.createOutputChannel('DI Navigator');
        channel.clear();
        channel.appendLine(`=== Service Summary: ${service.name} ===`);
        channel.appendLine(`Lifetime: ${service.registrations[0]?.lifetime || 'Unknown'}`);
        channel.appendLine(`Total Registrations: ${service.registrations.length}`);
        channel.appendLine(`Total Injection Sites: ${service.injectionSites.length}`);
        channel.appendLine(`Has Conflicts: ${service.hasConflicts ? 'Yes' : 'No'}`);
        channel.appendLine(`====================================`);
        channel.show();
    }

    /**
     * Show service conflicts
     * @param service Service data
     */
    private showServiceConflicts(service: any): void {
        if (!service.hasConflicts) {
            vscode.window.showInformationMessage(`No conflicts found for service: ${service.name}`);
            return;
        }

        const channel = vscode.window.createOutputChannel('DI Navigator');
        channel.clear();
        channel.appendLine(`=== Conflicts for: ${service.name} ===`);
        channel.appendLine('Note: Detailed conflict information would be shown here');
        channel.appendLine('This is a placeholder for conflict analysis functionality');
        channel.appendLine(`====================================`);
        channel.show();
    }

    /**
     * Handle registration selection
     * @param item Selected registration item
     */
    private handleRegistrationSelection(item: DINavigatorTreeItem): void {
        if (item.registrationData) {
            this.navigateToLocation(item.registrationData.filePath, item.registrationData.lineNumber);
        }
    }

    /**
     * Handle injection site selection
     * @param item Selected injection site item
     */
    private handleInjectionSiteSelection(item: DINavigatorTreeItem): void {
        if (item.injectionSiteData) {
            this.navigateToLocation(item.injectionSiteData.filePath, item.injectionSiteData.lineNumber);
        }
    }

    /**
     * Navigate to a specific location in a file
     * @param filePath File path
     * @param lineNumber Line number (1-based)
     */
    private async navigateToLocation(filePath: string, lineNumber: number): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document);

            const position = new vscode.Position(lineNumber - 1, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);

            this.logger.debug(`Navigated to: ${filePath}:${lineNumber}`, 'TreeViewManager');

        } catch (error) {
            this.logger.error(
                `Failed to navigate to location: ${filePath}:${lineNumber}`,
                'TreeViewManager',
                error
            );
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
    private analysisData: ProjectDI | null = null;
    private onDidChangeTreeDataEmitter = new vscode.EventEmitter<DINavigatorTreeItem | undefined | null>();
    public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * Get tree item for the given element
     * @param element Tree item element
     * @returns VSCode tree item
     */
    getTreeItem(element: DINavigatorTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children for the given element
     * @param element Parent element or null for root
     * @returns Array of child tree items
     */
    getChildren(element?: DINavigatorTreeItem): Thenable<DINavigatorTreeItem[]> {
        if (!element) {
            // Root level - return service groups
            return Promise.resolve(this.getRootItems());
        }

        switch (element.itemType) {
            case 'group':
                return Promise.resolve(this.getServiceItems(element));
            case 'service':
                return Promise.resolve(this.getRegistrationAndInjectionItems(element));
            default:
                return Promise.resolve([]);
        }
    }

    /**
      * Get root level items (service groups)
      * @returns Array of service group items
      */
    private getRootItems(): DINavigatorTreeItem[] {
        this.logger.debug('getRootItems called', 'DINavigatorTreeProvider', {
            hasAnalysisData: !!this.analysisData,
            serviceGroupsCount: this.analysisData?.serviceGroups?.length || 0
        });

        if (!this.analysisData) {
            this.logger.debug('No analysis data available, returning info item', 'DINavigatorTreeProvider');
            return [new DINavigatorTreeItem(
                'No analysis data available',
                'Run analysis to see DI services',
                'info',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        const items = this.analysisData.serviceGroups.map(group => {
            const serviceCount = group.services.length;
            const label = `${group.lifetime} Services (${serviceCount})`;

            this.logger.debug(`Creating group item: ${label}`, 'DINavigatorTreeProvider', {
                lifetime: group.lifetime,
                serviceCount
            });

            return new DINavigatorTreeItem(
                label,
                `Service group with ${serviceCount} services`,
                'group',
                serviceCount > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
                group
            );
        });

        this.logger.debug(`Returning ${items.length} root items`, 'DINavigatorTreeProvider');
        return items;
    }

    /**
     * Get service items for a group
     * @param groupItem Group tree item
     * @returns Array of service items
     */
    private getServiceItems(groupItem: DINavigatorTreeItem): DINavigatorTreeItem[] {
        const group = groupItem.groupData;
        if (!group) {
            return [];
        }

        return group.services.map((service: any) => {
            const registrationCount = service.registrations.length;
            const injectionCount = service.injectionSites.length;
            const hasConflicts = service.hasConflicts;

            let description = '';
            if (registrationCount > 0) {
                description += `${registrationCount} registration${registrationCount > 1 ? 's' : ''}`;
            }
            if (injectionCount > 0) {
                if (description) { description += ', '; }
                description += `${injectionCount} injection${injectionCount > 1 ? 's' : ''}`;
            }

            const iconPath = hasConflicts ? 'warning' : 'service';
            const collapsibleState = (registrationCount > 0 || injectionCount > 0)
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None;

            return new DINavigatorTreeItem(
                service.name,
                description,
                'service',
                collapsibleState,
                undefined,
                service
            );
        });
    }

    /**
     * Get registration and injection items for a service
     * @param serviceItem Service tree item
     * @returns Array of registration and injection items
     */
    private getRegistrationAndInjectionItems(serviceItem: DINavigatorTreeItem): DINavigatorTreeItem[] {
        const service = serviceItem.serviceData;
        if (!service) {
            return [];
        }

        const items: DINavigatorTreeItem[] = [];

        // Add registration items
        service.registrations.forEach((registration: any, index: number) => {
            items.push(new DINavigatorTreeItem(
                `Registration ${index + 1}: ${registration.methodCall}`,
                `${registration.filePath}:${registration.lineNumber}`,
                'registration',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                undefined,
                registration
            ));
        });

        // Add injection site items
        service.injectionSites.forEach((site: any, index: number) => {
            items.push(new DINavigatorTreeItem(
                `Injection ${index + 1}: ${site.className}.${site.memberName}`,
                `${site.filePath}:${site.lineNumber}`,
                'injection-site',
                vscode.TreeItemCollapsibleState.None,
                undefined,
                undefined,
                undefined,
                site
            ));
        });

        return items;
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
    updateAnalysisData(data: ProjectDI): void {
        this.analysisData = data;
        this.refresh();
    }
}

/**
 * Tree Item for DI Navigator
 */
export class DINavigatorTreeItem extends vscode.TreeItem {
    public readonly itemType: 'info' | 'group' | 'service' | 'registration' | 'injection-site';
    public readonly groupData?: any;
    public readonly serviceData?: any;
    public readonly registrationData?: any;
    public readonly injectionSiteData?: any;

    constructor(
        label: string,
        tooltip: string,
        itemType: DINavigatorTreeItem['itemType'],
        collapsibleState: vscode.TreeItemCollapsibleState,
        groupData?: any,
        serviceData?: any,
        registrationData?: any,
        injectionSiteData?: any
    ) {
        super(label, collapsibleState);

        this.itemType = itemType;
        this.tooltip = tooltip;
        this.groupData = groupData;
        this.serviceData = serviceData;
        this.registrationData = registrationData;
        this.injectionSiteData = injectionSiteData;

        // Set context value for menu contributions
        this.contextValue = itemType;

        // Set icons based on type
        switch (itemType) {
            case 'group':
                this.iconPath = new vscode.ThemeIcon('package');
                break;
            case 'service':
                this.iconPath = new vscode.ThemeIcon('symbol-class');
                break;
            case 'registration':
                this.iconPath = new vscode.ThemeIcon('add');
                break;
            case 'injection-site':
                this.iconPath = new vscode.ThemeIcon('arrow-right');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}