import { ExtensionContext, window, workspace } from 'vscode';
import { diNavigatorProvider } from './treeView';
import { serviceProvider } from './serviceProvider';
import { registerCommands } from './commands';
import {
  updateWorkspaceContext,
  createDebouncedRefreshHandler,
  setupFileSystemWatchers
} from './utils';
import { NET_FILE_PATTERNS } from './const';

export async function activate(context: ExtensionContext): Promise<void> {
  console.log('🚀 DI Navigator: Extension activation started!');
  console.log('📁 DI Navigator: Current workspace folders:', workspace.workspaceFolders?.map(f => f.uri.fsPath) || 'None');

  serviceProvider.setContext(context);

  const treeViewDisposable = window.registerTreeDataProvider('diNavigator', diNavigatorProvider);

  context.subscriptions.push(treeViewDisposable);

  console.log('🌳 DI Navigator: Tree view provider registered');

  updateWorkspaceContext().catch(err => console.error('Error during initial workspace detection:', err));

  const debouncedRefresh = createDebouncedRefreshHandler(500);
  setupFileSystemWatchers(context, NET_FILE_PATTERNS, debouncedRefresh);

  console.log('👀 DI Navigator: File system watchers set up');

  // Register commands
  registerCommands(context);

  console.log('✅ DI Navigator: Extension fully activated and ready!');
}

export function deactivate() {
  console.log('🔌 DI Navigator: Extension deactivation started');
  serviceProvider.clearState();
  console.log('🧹 DI Navigator: Service provider state cleared');
  // Refresh to clear the tree view
  diNavigatorProvider.refresh();
  console.log('🔄 DI Navigator: Tree view refreshed after deactivation');
  console.log('👋 DI Navigator: Extension deactivated');
}