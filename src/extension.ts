import * as vscode from 'vscode';
import { DINavigatorExtension } from './core/DINavigatorExtension';

let diNavigator: DINavigatorExtension | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        console.log('🚀 DI Navigator: Extension activation started');
        diNavigator = new DINavigatorExtension(context);
        await diNavigator.initialize();
        console.log('✅ DI Navigator: Extension activated successfully');
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceName = workspaceFolders[0].name;

            // Show welcome message and offer to show tree view
            vscode.window.showInformationMessage(
                `DI Navigator: Ready to analyze ${workspaceName}!`,
                'Show View',
                'Analyze Now'
            ).then(async selection => {
                if (selection === 'Show View') {
                    diNavigator?.showTreeView();
                } else if (selection === 'Analyze Now') {
                    await diNavigator?.analyzeProject();
                    // Show tree view after analysis
                    setTimeout(() => diNavigator?.showTreeView(), 1000);
                }
            });
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