import { ExtensionContext, workspace, window, commands } from 'vscode';
import { diNavigatorProvider } from './treeView';
import { serviceProvider } from './serviceProvider';
import { registerCommands } from './commands';
import {
  CONFIG_EXCLUDE_FOLDERS, CONFIG_SECTION,
  DEFAULT_EXCLUDE_FOLDERS, NET_FILE_PATTERNS,
  VALID_WORKSPACE_CONTEXT
} from './const';

function getExcludeGlob(fallbackPatterns: readonly string[]): string {
  const config = workspace.getConfiguration(CONFIG_SECTION);
  const patterns = config.get<string[]>(CONFIG_EXCLUDE_FOLDERS) || Array.from(fallbackPatterns);
  return patterns.join(', ');
}
export async function detectNetWorkspace(): Promise<boolean> {
  try {
    const excludeGlob = getExcludeGlob(DEFAULT_EXCLUDE_FOLDERS);
    const csprojFiles = await workspace.findFiles(NET_FILE_PATTERNS[0], excludeGlob);
    const slnFiles = await workspace.findFiles(NET_FILE_PATTERNS[1], excludeGlob);
    const slnxFiles = await workspace.findFiles(NET_FILE_PATTERNS[2], excludeGlob);
    const csFiles = await workspace.findFiles(NET_FILE_PATTERNS[3], excludeGlob);
    return csprojFiles.length > 0 || slnFiles.length > 0 || slnxFiles.length > 0 || csFiles.length > 0;
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

  // Function to update workspace context and state
  const updateWorkspaceContext = async (): Promise<void> => {
    const isNet = await detectNetWorkspace();
    await commands.executeCommand('setContext', VALID_WORKSPACE_CONTEXT, isNet);
    if (isNet) {
      console.log('.NET workspace detected. Refreshing DI services.');
      await serviceProvider.collectRegistrations();
      diNavigatorProvider.refresh();
    } else {
      console.log('Non-.NET workspace. Clearing DI analysis.');
      serviceProvider.clearState();
      diNavigatorProvider.refresh();
    }
  };

  // Initial detection and setup
  await updateWorkspaceContext();

  // Watch for relevant file changes to update context and refresh
  const excludeGlob = getExcludeGlob(DEFAULT_EXCLUDE_FOLDERS);

  NET_FILE_PATTERNS.forEach(pattern => {
    const watcher = workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(async () => await updateWorkspaceContext());
    watcher.onDidDelete(async () => await updateWorkspaceContext());
    watcher.onDidChange(async () => await updateWorkspaceContext());
    context.subscriptions.push(watcher);
  });

  // Register commands
  registerCommands(context);
}

export function deactivate() {
  serviceProvider.clearState();
  // Refresh to clear the tree view
  diNavigatorProvider.refresh();
}
