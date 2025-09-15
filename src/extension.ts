// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { ExtensionContext, workspace, window } from 'vscode';
import { diNavigatorProvider } from './treeView';
import { serviceProvider } from './serviceProvider';
import { registerCommands } from './commands';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
async function detectNetWorkspace(): Promise<boolean> {
  try {
    const config = workspace.getConfiguration('diNavigator');
    const excludePatterns = config.get<string[]>('excludeFolders') || ['**/bin/**', '**/obj/**', '**/Properties/**'];
    const excludeGlob = excludePatterns.join(', ');
    const csprojFiles = await workspace.findFiles('**/*.csproj', excludeGlob);
    const slnFiles = await workspace.findFiles('**/*.sln', excludeGlob);
    const slnxFiles = await workspace.findFiles('**/*.slnx', excludeGlob);
    return csprojFiles.length > 0 || slnFiles.length > 0 || slnxFiles.length > 0;
  } catch (error) {
    console.error('Error detecting .NET workspace:', error);
    return false;
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  console.log('Congratulations, your extension "di-navigator" is now active!');

  // Set context for serviceProvider
  serviceProvider.setContext(context);

  // Register TreeView provider always
  const treeViewDisposable = window.registerTreeDataProvider('diNavigator', diNavigatorProvider);
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
  const csWatcher = workspace.createFileSystemWatcher('**/*.cs');
  csWatcher.onDidChange(async () => {
    const isNet = await detectNetWorkspace();
    if (isNet) {
      await serviceProvider.refresh();
      diNavigatorProvider.refresh();
    }
  });
  context.subscriptions.push(csWatcher);

  // Register commands
  registerCommands(context);
}

// This method is called when your extension is deactivated
export function deactivate() {
  serviceProvider.clearState();
}
