import { commands, workspace, window, ExtensionContext, Uri, Range, Location } from 'vscode';
import { Service, InjectionSite } from './models';
import { serviceProvider } from './serviceProvider';
import { diNavigatorProvider } from './treeView';

export function registerCommands(context: ExtensionContext) {
  // Select project command
  const selectProjectDisposable = commands.registerCommand('di-navigator.selectProject', async () => {
    const slnFiles = await workspace.findFiles('**/*.sln');
    const slnxFiles = await workspace.findFiles('**/*.slnx');
    const csprojFiles = await workspace.findFiles('**/*.csproj');
    const allProjects = [...slnFiles, ...csprojFiles, ...slnxFiles];
    if (allProjects.length === 0) {
      window.showErrorMessage('No .sln or .csproj files found in workspace.');
      return;
    }

    const projectItems = allProjects.map(uri => ({ label: workspace.asRelativePath(uri), uri }));
    const selected = await window.showQuickPick(projectItems, { placeHolder: 'Select project for DI analysis' });
    if (selected) {
      await context.globalState.update('diNavigator.selectedProject', selected.uri.fsPath);
      await serviceProvider.refresh();
      await diNavigatorProvider.refresh();
      window.showInformationMessage(`Selected project: ${selected.label}`);
    }
  });

  // Clear selection command
  const clearSelectionDisposable = commands.registerCommand('di-navigator.clearProjectSelection', async () => {
    await context.globalState.update('diNavigator.selectedProject', undefined);
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage('Project selection cleared - scanning entire workspace.');
  });

  // Refresh services command
  const refreshDisposable = commands.registerCommand('di-navigator.refreshServices', async () => {
    await serviceProvider.refresh();
    await diNavigatorProvider.refresh();
    window.showInformationMessage('DI Services refreshed');
    console.log('Refresh DI Services command executed.');
  });

  // Go to implementation
  const gotoImplDisposable = commands.registerCommand('di-navigator.goToImplementation', async (service: Service) => {
    if (service && service.registrations.length > 0) {
      const reg = service.registrations[0];
      const doc = await workspace.openTextDocument(reg.filePath);
      await window.showTextDocument(doc, { selection: new Range(reg.lineNumber - 1, 0, reg.lineNumber - 1, 0) });
    } else {
      window.showInformationMessage('No implementation found for this service.');
    }
    console.log('Go to DI Implementation command executed.');
  });

  // Go to injection site (stub for future)
  const gotoSiteDisposable = commands.registerCommand('di-navigator.goToInjectionSite', async (site: InjectionSite) => {
    if (site) {
      const doc = await workspace.openTextDocument(site.filePath);
      await window.showTextDocument(doc, { selection: new Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0) });
    }
    console.log('Go to Injection Site command executed.');
  });

  context.subscriptions.push(selectProjectDisposable, clearSelectionDisposable, refreshDisposable, gotoImplDisposable, gotoSiteDisposable);
}

// Basic injection site search (stub for future)
export function findInjectionSites(serviceName: string): Location[] {
  const locations: Location[] = [];
  // Use the global serviceProvider instance
  const groups = serviceProvider.getServiceGroups();
  for (const group of groups) {
    for (const service of group.services) {
      if (service.name === serviceName) {
        for (const site of service.injectionSites) {
          const uri = Uri.file(site.filePath);
          const range = new Range(site.lineNumber - 1, 0, site.lineNumber - 1, 0);
          locations.push(new Location(uri, range));
        }
        break; // Found the service, no need to search further
      }
    }
  }
  return locations;
}