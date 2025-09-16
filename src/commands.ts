import {
  commands, workspace, window, ExtensionContext,
  Uri, Range, Position, WorkspaceEdit, FileSystemError
} from 'vscode';
import { Service, InjectionSite, Registration, PickItem } from './models';
import { serviceProvider } from './serviceProvider';
import { diNavigatorProvider } from './treeView';
import {
  COMMAND_CLEAR_SELECTION, COMMAND_GO_TO_IMPL,
  COMMAND_GO_TO_SITE, COMMAND_REFRESH_SERVICES,
  COMMAND_SELECT_PROJECT, GLOBAL_STATE_KEY,
  MESSAGE_CLEARED_SELECTION, MESSAGE_NO_IMPL,
  MESSAGE_NO_PROJECTS, MESSAGE_REFRESHED,
  PROJECT_PATTERNS
} from './const';


async function findProjectFiles(context: ExtensionContext): Promise<Uri[]> {
  const CACHE_KEY = 'cachedProjects';
  const TTL = 5 * 60 * 1000; // 5 minutes

  let cached = context.workspaceState.get<{ uris: Uri[]; timestamp: number; }>(CACHE_KEY);
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
  // Scan all projects command
  /**
   * Scans all projects in workspace for DI analysis.
   */
  const selectProjectDisposable = commands.registerCommand(COMMAND_SELECT_PROJECT, async () => {
    const allProjects = await findProjectFiles(context);
    if (allProjects.length === 0) {
      window.showErrorMessage(MESSAGE_NO_PROJECTS);
      return;
    }

    // Store all projects as array of paths
    const projectPaths = allProjects.map(uri => uri.fsPath);
    await context.globalState.update(GLOBAL_STATE_KEY, projectPaths);
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage(`Scanned ${allProjects.length} projects for DI registrations.`);
    console.log('Scan All Projects command executed.');
  });

  // Clear selection command
  /**
   * Clears the selected projects and refreshes providers.
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

  // Search services command
  /**
   * Searches and navigates to a DI service.
   */
  const searchServicesDisposable = commands.registerCommand('di-navigator.searchServices', async () => {
    const services = serviceProvider.getAllServices();
    if (!services.length) {
      window.showInformationMessage('No DI services found.');
      return;
    }
    const selected = await window.showQuickPick(services.map(s => ({
      label: s.name,
      detail: `${s.registrations.length} registrations`,
      service: s
    } as any)), {
      placeHolder: 'Select a service to navigate to'
    });
    if (!selected) {
      return;
    }
    const reg = selected.service.registrations[0];
    if (reg) {
      const success = await validateAndOpen(reg.filePath, reg.lineNumber);
      if (success) {
        console.log(`Navigated to service ${selected.service.name} at ${reg.filePath}:${reg.lineNumber}`);
      }
    }
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
  const gotoSiteDisposable = commands.registerCommand(COMMAND_GO_TO_SITE,
    async (site: InjectionSite) => {
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

  // Resolve conflicts command
  /**
   * Shows conflicts and allows resolving them, e.g., removing duplicates.
   */
  const resolveConflictsDisposable = commands.registerCommand('di-navigator.resolveConflicts', async () => {
    const groups = serviceProvider.getServiceGroups();
    const conflicts = [];
    for (const group of groups) {
      for (const service of group.services) {
        if (service.hasConflicts && service.conflicts) {
          conflicts.push(...service.conflicts.map((c: { type: any; details: any; }) => ({
            label: `${service.name}: ${c.type}`,
            detail: c.details,
            conflict: c,
            service: service
          })));
        }
      }
    }

    if (conflicts.length === 0) {
      window.showInformationMessage('No conflicts found in DI registrations.');
      return;
    }

    const selected = await window.showQuickPick(conflicts, {
      placeHolder: 'Select a conflict to resolve',
      canPickMany: false
    });

    if (!selected) {
      return;
    }

    // Basic resolution: for duplicate implementations, offer to remove one
    if (selected.conflict.type === 'DuplicateImplementation') {
      const options = ['Navigate to first', 'Navigate to second', 'Remove duplicate (first)', 'Remove duplicate (second)', 'Cancel'];
      const choice = await window.showQuickPick(options, { placeHolder: 'How to resolve?' });
      if (choice && choice.includes('Remove') && selected.service.registrations.length > 1) {
        // Find the duplicate regs for removal
        const duplicateRegs = selected.service.registrations.filter((r: { implementationType: any; }) => r.implementationType === selected.conflict.details.split(' ')[0]);
        if (duplicateRegs.length > 1) {
          const toRemove = choice.includes('first') ? duplicateRegs[0] : duplicateRegs[1];
          const edit = await window.showQuickPick(['Yes, remove', 'No'], { placeHolder: 'Confirm removal of registration at ' + toRemove.filePath + ':' + toRemove.lineNumber });
          if (edit === 'Yes, remove') {
            try {
              const uri = Uri.file(toRemove.filePath);
              const doc = await workspace.openTextDocument(uri);
              const start = new Position(toRemove.lineNumber - 1, 0);
              const range = new Range(start, start);
              const edit = new WorkspaceEdit();
              edit.insert(uri, start, '// ');
              const success = await workspace.applyEdit(edit);
              if (success) {
                window.showInformationMessage(`Commented out duplicate registration at ${toRemove.filePath}:${toRemove.lineNumber}.`);
              } else {
                window.showWarningMessage(`Failed to apply edit to ${toRemove.filePath}.`);
              }
            } catch (error) {
              console.error('Error editing file:', error);
              const errMsg = error instanceof Error ? error.message : 'Unknown error';
              window.showErrorMessage(`Failed to edit ${toRemove.filePath}: ${errMsg}`);
            }
            await serviceProvider.refresh();
            await diNavigatorProvider.refresh();
          }
        }
      } else if (choice === 'Navigate to first' || choice === 'Navigate to second') {
        const reg = selected.service.registrations[0];
        await validateAndOpen(reg.filePath, reg.lineNumber);
      }
    } else if (selected.conflict.type === 'MultipleImplementations') {
      // Suggest choosing one impl
      const regMaps = new Set(selected.service.registrations.map((r: { implementationType: any; }) => r.implementationType));
      const impls: any[] = Array.from(regMaps);
      const choice = await window.showQuickPick(impls, { placeHolder: 'Select preferred implementation, others will be marked for removal' });
      if (choice) {
        window.showInformationMessage(`Preferred impl: ${choice}. Manually remove others.`);
      }
    } else {
      window.showInformationMessage(`Conflict "${selected.conflict.type}": ${selected.conflict.details}. Manual resolution recommended.`);
    }

    console.log('Resolve Conflicts command executed.');
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
    searchServicesDisposable,
    gotoImplDisposable,
    gotoSiteDisposable,
    resolveConflictsDisposable
  );

  console.log('All DI Navigator commands registered successfully.');
}