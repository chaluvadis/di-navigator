import {
  ExtensionContext,
  workspace, window,
  commands, ProgressLocation, Uri
} from 'vscode';
import { diNavigatorProvider } from './treeView';
import { serviceProvider } from './serviceProvider';
import { registerCommands } from './commands';
import {
  CONFIG_EXCLUDE_FOLDERS, CONFIG_SECTION,
  DEFAULT_EXCLUDE_FOLDERS, NET_FILE_PATTERNS,
  VALID_WORKSPACE_CONTEXT
} from './const';

export const debounce = (func: Function, delay: number) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: any[]) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(null, args), delay);
  };
};
function getExcludeGlob(fallbackPatterns: readonly string[]): string {
  const config = workspace.getConfiguration(CONFIG_SECTION);
  const patterns = config.get<string[]>(CONFIG_EXCLUDE_FOLDERS) || Array.from(fallbackPatterns);
  return patterns.length > 1 ? `{${patterns.join(',')}}` : patterns[0];
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
      // Run a background scan with a progress notification so activation is not blocked.
      window.withProgress({
        location: ProgressLocation.Notification,
        title: 'DI Navigator: Scanning C# files',
        cancellable: false
      }, async (p) => {
        await serviceProvider.collectRegistrations(p);
        diNavigatorProvider.refresh();
      }).then(() => {
        // completed
      }, (err: unknown) => {
        console.error('Error during DI scan:', err);
        diNavigatorProvider.refresh();
      });
    } else {
      console.log('Non-.NET workspace. Clearing DI analysis.');
      serviceProvider.clearState();
      diNavigatorProvider.refresh();
    }
  };

  // Initial detection and setup (do not block activation; run scan in background)
  // Kick off detection/scan but don't await here so the extension activates quickly.
  updateWorkspaceContext().catch(err => console.error('Error during initial workspace detection:', err));
  // Watch for relevant file changes to update context and refresh

  const debouncedUpdate = debounce(updateWorkspaceContext, 500); // 500ms debounce

  const debouncedInvalidate = debounce((uri: Uri) => {
    serviceProvider.invalidateFile(uri.fsPath);
    serviceProvider.refresh().then(() => {
      diNavigatorProvider.refresh();
    }).catch((err) => {
      console.error('Error during selective refresh:', err);
    });
  }, 500);

  NET_FILE_PATTERNS.forEach(pattern => {
    const watcher = workspace.createFileSystemWatcher(pattern);
    watcher.onDidCreate(debouncedInvalidate);
    watcher.onDidDelete(debouncedInvalidate);
    watcher.onDidChange(debouncedInvalidate);
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

