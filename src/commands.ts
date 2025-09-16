import { commands, workspace, window, ExtensionContext, Uri, Range, Location, QuickPickItem, FileSystemError } from 'vscode';
import { Service, InjectionSite, Registration, ProjectItem, PickItem } from './models';
import { serviceProvider } from './serviceProvider';
import { diNavigatorProvider } from './treeView';
import {
  COMMAND_CLEAR_SELECTION, COMMAND_GO_TO_IMPL,
  COMMAND_GO_TO_SITE, COMMAND_REFRESH_SERVICES,
  COMMAND_SELECT_PROJECT, GLOBAL_STATE_KEY,
  MESSAGE_CLEARED_SELECTION, MESSAGE_NO_IMPL,
  MESSAGE_NO_PROJECTS, MESSAGE_REFRESHED,
  PLACEHOLDER_SELECT_PROJECT,
  PROJECT_PATTERNS
} from './const';

const MESSAGE_SELECTED_PROJECT = (label: string) => `Selected project= ${label}`;

async function findProjectFiles(context: ExtensionContext): Promise<Uri[]> {
  const CACHE_KEY = 'cachedProjects';
  const TTL = 5 * 60 * 1000; // 5 minutes

  let cached = context.workspaceState.get<{ uris: Uri[]; timestamp: number }>(CACHE_KEY);
  if (cached && Date.now() - cached.timestamp < TTL) {
    return cached.uris;
  }

  const allProjects: Uri[] = [];
  try {
    for (const pattern of PROJECT_PATTERNS) {
      try {
        const files = await workspace.findFiles(pattern);
        allProjects.push(...files);
      } catch (error) {
        console.error(`Error scanning pattern ${pattern}: ${error}`);
        window.showWarningMessage(`Scan failed for ${pattern}`);
      }
    }
    // Deduplicate
    const uniqueProjects = Array.from(new Set(allProjects.map(uri => uri.fsPath)))
      .map(fsPath => Uri.file(fsPath));

    // Cache
    await context.workspaceState.update(CACHE_KEY, {
      uris: uniqueProjects,
      timestamp: Date.now()
    });
    return uniqueProjects;
  } catch (error) {
    console.error(`Error in findProjectFiles: ${error}`);
    window.showWarningMessage('Failed to find projects. Check workspace permissions.');
    // Invalidate cache on error
    await context.workspaceState.update(CACHE_KEY, undefined);
    return [];
  }
}

async function validateAndOpen(filePath: string, lineNumber: number): Promise<boolean> {
  try {
    const uri = Uri.file(filePath);
    await workspace.fs.stat(uri);
    const doc = await workspace.openTextDocument(uri);
    await window.showTextDocument(doc, { selection: new Range(lineNumber - 1, 0, lineNumber - 1, 0) });
    return true;
  } catch (error) {
    if (error instanceof FileSystemError && error.code === 'EntryNotFound') {
      window.showWarningMessage(`File not found: ${filePath}`);
    } else if (error instanceof Error) {
      window.showErrorMessage(`Error opening ${filePath}: ${error.message}`);
    } else {
      window.showErrorMessage(`Error opening ${filePath}: Unknown error`);
    }
    return false;
  }
}

function getMessage(label: string, ...args: any[]): string {
  // Placeholder for centralized messages; extend as needed
  return label.replace(/{(\d+)}/g, (_, i) => String(args[i] || ''));
}

export function registerCommands(context: ExtensionContext) {
  // Select project command
  /**
   * Selects a project for DI analysis.
   * Scans workspace for project files and allows user to pick one.
   */
  const selectProjectDisposable = commands.registerCommand(COMMAND_SELECT_PROJECT, async () => {
    const allProjects = await findProjectFiles(context);
    if (allProjects.length === 0) {
      window.showErrorMessage(MESSAGE_NO_PROJECTS);
      return;
    }

    const projectItems: ProjectItem[] = allProjects.map(uri => ({
      label: workspace.asRelativePath(uri),
      uri
    } as ProjectItem));

    const selected = await window.showQuickPick<ProjectItem>(projectItems, {
      placeHolder: PLACEHOLDER_SELECT_PROJECT,
      canPickMany: false,
      ignoreFocusOut: true
    });
    if (selected) {
      await context.globalState.update(GLOBAL_STATE_KEY, Uri.file(selected.uri.fsPath).fsPath);
      await serviceProvider.refresh();
      await diNavigatorProvider.refresh();
      window.showInformationMessage(MESSAGE_SELECTED_PROJECT(selected.label));
    }
    console.log('Select Project command executed.');
  });

  // Clear selection command
  /**
   * Clears the selected project and refreshes providers.
   */
  const clearSelectionDisposable = commands.registerCommand(COMMAND_CLEAR_SELECTION, async () => {
    console.log('DI Navigator: Clear Selection command executed.');
    await context.globalState.update(GLOBAL_STATE_KEY, undefined);
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage(MESSAGE_CLEARED_SELECTION);
  });

  // Refresh services command
  /**
   * Refreshes the DI services and tree view.
   */
  const refreshDisposable = commands.registerCommand(COMMAND_REFRESH_SERVICES, async () => {
    console.log('DI Navigator: Refresh Services command executed.');
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage(MESSAGE_REFRESHED);
  });

  // Go to implementation
  /**
   * Navigates to the implementation of a DI service.
   * Supports multiple registrations via QuickPick.
   * @param service The service to navigate to.
   */
  const gotoImplDisposable = commands.registerCommand(COMMAND_GO_TO_IMPL, async (service: Service) => {
    if (!service || service.registrations.length === 0) {
      window.showInformationMessage(MESSAGE_NO_IMPL);
      console.log('Go to DI Implementation command executed: No registrations.');
      return;
    }

    let reg: Registration;
    if (service.registrations.length === 1) {
      reg = service.registrations[0];
    } else {
      const pickItems: PickItem[] = service.registrations.map(r => ({
        label: `${workspace.asRelativePath(Uri.file(r.filePath))}:${r.lineNumber}`,
        detail: r.filePath,
        registration: r
      } as PickItem));

      const selected = await window.showQuickPick<PickItem>(pickItems, {
        placeHolder: 'Select implementation to navigate to',
        canPickMany: false
      });
      if (!selected) {
        console.log('Go to DI Implementation command cancelled.');
        return;
      }
      reg = selected.registration;
    }

    const success = await validateAndOpen(reg.filePath, reg.lineNumber);
    if (success) {
      console.log(`Go to DI Implementation command executed: ${reg.filePath}:${reg.lineNumber}`);
    } else {
      console.log('Go to DI Implementation command failed: Invalid file.');
    }
  });

  // Go to injection site
  /**
   * Navigates to the injection site in the editor.
   * @param site The injection site to navigate to.
   */
  const gotoSiteDisposable = commands.registerCommand(COMMAND_GO_TO_SITE, async (site: InjectionSite) => {
    if (!site) {
      window.showInformationMessage('No injection site selected.');
      console.log('Go to Injection Site command executed: No site provided.');
      return;
    }

    const success = await validateAndOpen(site.filePath, site.lineNumber);
    if (success) {
      console.log(`Go to Injection Site command executed: ${site.filePath}:${site.lineNumber}`);
    } else {
      console.log('Go to Injection Site command failed: Invalid file.');
    }
  });

  // Invalidate cache on workspace changes
  const invalidateCache = () => {
    context.workspaceState.update('cachedProjects', undefined);
  };
  const workspaceChangeDisposable = workspace.onDidChangeWorkspaceFolders(invalidateCache);
  context.subscriptions.push(workspaceChangeDisposable);

  context.subscriptions.push(
    selectProjectDisposable,
    clearSelectionDisposable,
    refreshDisposable,
    gotoImplDisposable,
    gotoSiteDisposable
  );

  console.log('All DI Navigator commands registered successfully.');
}