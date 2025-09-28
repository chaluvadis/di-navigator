import * as vscode from 'vscode';
import { DINavigatorExtension } from './core/DINavigatorExtension';

// Export for testing
export { DINavigatorExtension };

let diNavigator: DINavigatorExtension | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        console.log('🚀 DI Navigator: Extension activation started');

        // Validate workspace before initializing
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.warn('DI Navigator: No workspace folder available. Extension will activate when a .NET project is opened.');
            // Still create the extension instance but don't initialize until workspace is available
            diNavigator = new DINavigatorExtension(context);

            // Set up workspace change listener
            const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && !diNavigator?.isInitialized) {
                    console.log('DI Navigator: Workspace detected, initializing extension...');
                    diNavigator?.initialize().then(() => {
                        const workspaceName = vscode.workspace.workspaceFolders![0].name;
                        vscode.window.showInformationMessage(
                            `DI Navigator: Activated for ${workspaceName} - Starting automatic analysis...`
                        );
                        diNavigator?.analyzeProject().then(() => {
                            setTimeout(() => diNavigator?.showTreeView(), 1000);
                        }).catch(error => {
                            console.warn('Auto-analysis failed, showing tree view:', error);
                            diNavigator?.showTreeView();
                        });
                    }).catch(error => {
                        vscode.window.showErrorMessage(
                            `DI Navigator: Failed to initialize - ${error}`
                        );
                    });
                    workspaceChangeListener.dispose();
                }
            });

            context.subscriptions.push(workspaceChangeListener);
            return;
        }

        diNavigator = new DINavigatorExtension(context);
        await diNavigator.initialize();
        console.log('✅ DI Navigator: Extension activated successfully');

        const workspaceName = workspaceFolders[0].name;

        // Show simple notification and auto-analyze
        vscode.window.showInformationMessage(
            `DI Navigator: Activated for ${workspaceName} - Starting automatic analysis...`
        );

        // Automatically analyze the project
        if (diNavigator) {
            try {
                await diNavigator.analyzeProject();
                // Show tree view after analysis
                setTimeout(() => diNavigator?.showTreeView(), 1000);
            } catch (error) {
                // If auto-analysis fails, show the tree view anyway
                console.warn('Auto-analysis failed, showing tree view:', error);
                diNavigator?.showTreeView();
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `DI Navigator: Failed to activate - ${error}`
        );
    }
}

export function deactivate(): void {
    try {
        if (diNavigator) {
            diNavigator.dispose();
            diNavigator = undefined;
        }
    } catch (error) {
        console.error('❌ DI Navigator: Error during deactivation:', error);
    }
}