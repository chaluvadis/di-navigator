import * as vscode from 'vscode';
import { DINavigatorExtension } from './core/DINavigatorExtension';

let diNavigator: DINavigatorExtension | undefined;
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    try {
        diNavigator = new DINavigatorExtension(context);
        await diNavigator.initialize();
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceName = workspaceFolders[0].name;
            vscode.window.showInformationMessage(
                `DI Navigator: Ready to analyze ${workspaceName}!`,
                'Analyze Now'
            ).then(selection => {
                if (selection === 'Analyze Now') {
                    diNavigator?.analyzeProject();
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