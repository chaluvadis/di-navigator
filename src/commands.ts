import { commands, workspace, window, ExtensionContext, Uri, Range, Location } from 'vscode';
import { Service, InjectionSite } from './models';
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

async function findProjectFiles(): Promise<Uri[]> {
  const allProjects: Uri[] = [];
  for (const pattern of PROJECT_PATTERNS) {
    const files = await workspace.findFiles(pattern);
    allProjects.push(...files);
  }
  return allProjects;
}

export function registerCommands(context: ExtensionContext) {
  // Select project command
  const selectProjectDisposable = commands.registerCommand(COMMAND_SELECT_PROJECT, async () => {
    const allProjects = await findProjectFiles();
    if (allProjects.length === 0) {
      window.showErrorMessage(MESSAGE_NO_PROJECTS);
      return;
    }

    const projectItems = allProjects.map(uri => ({ label: workspace.asRelativePath(uri), uri }));
    const selected = await window.showQuickPick(projectItems, { placeHolder: PLACEHOLDER_SELECT_PROJECT });
    if (selected) {
      await context.globalState.update(GLOBAL_STATE_KEY, selected.uri.fsPath);
      await serviceProvider.refresh();
      await diNavigatorProvider.refresh();
      window.showInformationMessage(MESSAGE_SELECTED_PROJECT(selected.label));
    }
  });

  // Clear selection command
  const clearSelectionDisposable = commands.registerCommand(COMMAND_CLEAR_SELECTION, async () => {
    await context.globalState.update(GLOBAL_STATE_KEY, undefined);
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage(MESSAGE_CLEARED_SELECTION);
  });

  // Refresh services command
  const refreshDisposable = commands.registerCommand(COMMAND_REFRESH_SERVICES, async () => {
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage(MESSAGE_REFRESHED);
    console.log('Refresh DI Services command executed.');
  });

  // Go to implementation
  const gotoImplDisposable = commands.registerCommand(COMMAND_GO_TO_IMPL, async (service: Service) => {
    if (service && service.registrations.length > 0) {
      const reg = service.registrations[0];
      const doc = await workspace.openTextDocument(reg.filePath);
      await window.showTextDocument(doc, { selection: new Range(reg.lineNumber - 1, 0, reg.lineNumber - 1, 0) });
    } else {
      window.showInformationMessage(MESSAGE_NO_IMPL);
    }
    console.log('Go to DI Implementation command executed.');
  });

  // Go to injection site (stub for future)
  const gotoSiteDisposable = commands.registerCommand(COMMAND_GO_TO_SITE, async (site: InjectionSite) => {
    if (site) {
      const doc = await workspace.openTextDocument(site.filePath);
      await window.showTextDocument(doc, { selection: new Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0) });
    }
    console.log('Go to Injection Site command executed.');
  });

  context.subscriptions.push(
    selectProjectDisposable,
    clearSelectionDisposable,
    refreshDisposable,
    gotoImplDisposable,
    gotoSiteDisposable
  );
}
