import * as vscode from 'vscode';
import { Service, InjectionSite } from './models';
import { serviceProvider } from './serviceProvider';

export function registerCommands(context: vscode.ExtensionContext) {
  const gotoImplDisposable = vscode.commands.registerCommand('di-navigator.goToImplementation', (service: Service) => {
    if (service && service.registrations.length > 0) {
      const reg = service.registrations[0];
      vscode.workspace.openTextDocument(reg.filePath).then(doc => {
        const line = reg.lineNumber - 1;
        const position = new vscode.Position(line, 0);
        const range = new vscode.Range(position, position);
        vscode.window.showTextDocument(doc, { selection: range });
      });
    } else {
      vscode.window.showInformationMessage('No implementation found for this service.');
    }
  });

  context.subscriptions.push(gotoImplDisposable);
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