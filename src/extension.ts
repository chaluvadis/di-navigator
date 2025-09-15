// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { diNavigatorProvider } from './treeView';
import { serviceProvider } from './serviceProvider';
import { Service, InjectionSite } from './models';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
async function detectNetWorkspace(): Promise<boolean> {
  try {
    const config = vscode.workspace.getConfiguration('diNavigator');
    const excludePatterns = config.get<string[]>('excludeFolders') || ['**/bin/**', '**/obj/**', '**/Properties/**'];
    const excludeGlob = excludePatterns.join(', ');
    const csprojFiles = await vscode.workspace.findFiles('**/*.csproj', excludeGlob);
    const slnFiles = await vscode.workspace.findFiles('**/*.sln', excludeGlob);
    return csprojFiles.length > 0 || slnFiles.length > 0;
  } catch (error) {
    console.error('Error detecting .NET workspace:', error);
    return false;
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  console.log('Congratulations, your extension "di-navigator" is now active!');

  // Register TreeView provider
  const treeViewDisposable = vscode.window.registerTreeDataProvider('diNavigator', diNavigatorProvider);
  context.subscriptions.push(treeViewDisposable);

  // Detect if this is a .NET workspace
  const isNet = await detectNetWorkspace();
  if (isNet) {
    console.log('.NET workspace detected. DI services will be analyzed.');
    // Initial analysis
    await serviceProvider.collectRegistrations();
    diNavigatorProvider.refresh();
  } else {
    console.log('Non-.NET workspace. DI analysis disabled.');
  }

  // Watch for .cs file changes to refresh
  const csWatcher = vscode.workspace.createFileSystemWatcher('**/*.cs');
  csWatcher.onDidChange(async () => {
    const isNet = await detectNetWorkspace();
    if (isNet) {
      await serviceProvider.refresh();
      diNavigatorProvider.refresh();
    }
  });
  context.subscriptions.push(csWatcher);

  // Register commands
  const refreshDisposable = vscode.commands.registerCommand('di-navigator.refreshServices', async () => {
    await serviceProvider.refresh();
    diNavigatorProvider.refresh();
    vscode.window.showInformationMessage('DI Services refreshed');
    console.log('Refresh DI Services command executed.');
  });

  const gotoImplDisposable = vscode.commands.registerCommand('di-navigator.goToImplementation', async (service: Service) => {
    // Basic navigation: open the file of first registration
    if (service && service.registrations.length > 0) {
      const reg = service.registrations[0];
      const doc = await vscode.workspace.openTextDocument(reg.filePath);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(reg.lineNumber - 1, 0, reg.lineNumber - 1, 0) });
    }
    console.log('Go to DI Implementation command executed.');
  });

  const gotoSiteDisposable = vscode.commands.registerCommand('di-navigator.goToInjectionSite', async (site: InjectionSite) => {
    if (site) {
      const doc = await vscode.workspace.openTextDocument(site.filePath);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0) });
    }
    console.log('Go to Injection Site command executed.');
  });

  context.subscriptions.push(refreshDisposable, gotoImplDisposable, gotoSiteDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
