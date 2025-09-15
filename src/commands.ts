import * as vscode from 'vscode';
import { Service, InjectionSite } from './models';
import { serviceProvider } from './serviceProvider';
import { diNavigatorProvider } from './treeView';

export function registerCommands(context: vscode.ExtensionContext) {
  // Select project command
  const selectProjectDisposable = vscode.commands.registerCommand('di-navigator.selectProject', async () => {
    const slnFiles = await vscode.workspace.findFiles('**/*.sln');
    const slnxFiles = await vscode.workspace.findFiles('**/*.slnx');
    const csprojFiles = await vscode.workspace.findFiles('**/*.csproj');
    const allProjects = [...slnFiles, ...csprojFiles, ...slnxFiles];
    if (allProjects.length === 0) {
      vscode.window.showErrorMessage('No .sln or .csproj files found in workspace.');
      return;
    }

    const projectItems = allProjects.map(uri => ({ label: vscode.workspace.asRelativePath(uri), uri }));
    const selected = await vscode.window.showQuickPick(projectItems, { placeHolder: 'Select project for DI analysis' });
    if (selected) {
      await context.globalState.update('diNavigator.selectedProject', selected.uri.fsPath);
      await serviceProvider.refresh();
      await diNavigatorProvider.refresh();
      vscode.window.showInformationMessage(`Selected project: ${selected.label}`);
    }
  });

  // Clear selection command
  const clearSelectionDisposable = vscode.commands.registerCommand('di-navigator.clearProjectSelection', async () => {
    await context.globalState.update('diNavigator.selectedProject', undefined);
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    vscode.window.showInformationMessage('Project selection cleared - scanning entire workspace.');
  });

  // Refresh services command
  const refreshDisposable = vscode.commands.registerCommand('di-navigator.refreshServices', async () => {
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    vscode.window.showInformationMessage('DI Services refreshed');
    console.log('Refresh DI Services command executed.');
  });

  // Go to implementation
  const gotoImplDisposable = vscode.commands.registerCommand('di-navigator.goToImplementation', async (service: Service) => {
    if (service && service.registrations.length > 0) {
      const reg = service.registrations[0];
      const doc = await vscode.workspace.openTextDocument(reg.filePath);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(reg.lineNumber - 1, 0, reg.lineNumber - 1, 0) });
    } else {
      vscode.window.showInformationMessage('No implementation found for this service.');
    }
    console.log('Go to DI Implementation command executed.');
  });

  // Go to injection site (stub for future)
  const gotoSiteDisposable = vscode.commands.registerCommand('di-navigator.goToInjectionSite', async (site: InjectionSite) => {
    if (site) {
      const doc = await vscode.workspace.openTextDocument(site.filePath);
      await vscode.window.showTextDocument(doc, { selection: new vscode.Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0) });
    }
    console.log('Go to Injection Site command executed.');
  });

  context.subscriptions.push(selectProjectDisposable, clearSelectionDisposable, refreshDisposable, gotoImplDisposable, gotoSiteDisposable);
}

// Basic injection site search (stub for future)
export function findInjectionSites(serviceName: string): vscode.Location[] {
  const locations: vscode.Location[] = [];
  // Use the global serviceProvider instance
  const groups = serviceProvider.getServiceGroups();
  for (const group of groups) {
    for (const service of group.services) {
      if (service.name === serviceName) {
        for (const site of service.injectionSites) {
          const uri = vscode.Uri.file(site.filePath);
          const range = new vscode.Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0);
          locations.push(new vscode.Location(uri, range));
        }
        break; // Found the service, no need to search further
      }
    }
  }
  return locations;
}