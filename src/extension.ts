import * as vscode from 'vscode';
import { DINavigatorExtension } from './core/DINavigatorExtension';

// Export for testing
export { DINavigatorExtension };

let diNavigator: DINavigatorExtension | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            diNavigator = new DINavigatorExtension(context);
            const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(() => {
                if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0 && !diNavigator?.isInitialized) {
                    console.log('DI Navigator: Workspace detected, initializing extension...');
                    diNavigator?.initialize().then(() => {
                        const workspaceName = vscode.workspace.workspaceFolders![0].name;
                        vscode.window.showInformationMessage(
                            `DI Navigator: Activated for ${workspaceName} - Starting automatic analysis...`
                        );
                        diNavigator?.analyzeProject().then(async () => {
                            await diNavigator?.showTreeView();
                        }).catch(async (error) => {
                            console.warn('Auto-analysis failed, showing tree view:', error);
                            await diNavigator?.showTreeView();
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
        const workspaceName = workspaceFolders[0].name;

        // Show simple notification and auto-analyze
        vscode.window.showInformationMessage(
            `DI Navigator: Activated for ${workspaceName} - Starting automatic analysis...`
        );

        // Automatically analyze the project
        if (diNavigator) {
            try {
                await diNavigator.analyzeProject();
                await diNavigator?.showTreeView();
            } catch (error) {
                await diNavigator?.showTreeView();
            }
        }
    } catch (error) {
        vscode.window.showErrorMessage(
            `DI Navigator: Failed to activate - ${error}`
        );
    }
}

export function deactivate(): void {
    if (diNavigator) {
        diNavigator.dispose();
        diNavigator = undefined;
    }
}