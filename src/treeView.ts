import * as vscode from 'vscode';
import { ServiceGroup, Service, InjectionSite } from './models';
import { serviceProvider } from './serviceProvider';

function isServiceGroup(element: any): element is ServiceGroup {
  return element
    && typeof element === 'object'
    && 'lifetime' in element
    && 'services' in element
    && Array.isArray(element.services);
}

function isInjectionSite(element: any): element is InjectionSite {
  return element
    && typeof element === 'object'
    && 'filePath' in element
    && 'lineNumber' in element
    && 'className' in element
    && 'serviceType' in element;
}

function isService(element: any): element is Service {
  return element
    && typeof element === 'object'
    && 'name' in element
    && 'registrations' in element
    && Array.isArray(element.registrations);
}

export class DINavigatorProvider implements vscode.TreeDataProvider<vscode.TreeItem | ServiceGroup | Service | InjectionSite> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem
    | ServiceGroup
    | Service
    | InjectionSite
    | undefined
    | null
    | void
  >();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: vscode.TreeItem | ServiceGroup | Service | InjectionSite): vscode.TreeItem {
    if (isServiceGroup(element)) {
      const groupItem = new vscode.TreeItem(element.lifetime, vscode.TreeItemCollapsibleState.Collapsed);
      groupItem.description = `${element.services.length} services`;
      groupItem.iconPath = new vscode.ThemeIcon('folder');
      groupItem.resourceUri = undefined;
      return groupItem;
    } else if (isService(element)) {
      const serviceItem = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.Collapsed);
      serviceItem.description = `${element.registrations.length} registrations${element.injectionSites.length > 0 ? `, ${element.injectionSites.length} injection sites` : ''}`;
      serviceItem.iconPath = new vscode.ThemeIcon('symbol-class');
      if (element.hasConflicts) {
        serviceItem.iconPath = new vscode.ThemeIcon('warning');
      }
      // Command for navigation
      serviceItem.command = {
        command: 'di-navigator.goToImplementation',
        title: 'Go to Implementation',
        arguments: [element]
      };
      return serviceItem;
    } else if (isInjectionSite(element)) {
      const siteItem = new vscode.TreeItem(`${element.className}.${element.memberName} (${element.serviceType})`, vscode.TreeItemCollapsibleState.None);
      siteItem.description = `Line ${element.lineNumber}`;
      siteItem.iconPath = new vscode.ThemeIcon('symbol-method');
      siteItem.command = {
        command: 'di-navigator.goToInjectionSite',
        title: 'Go to Injection Site',
        arguments: [element]
      };
      return siteItem;
    }
    return element as vscode.TreeItem;
  }

  getChildren(element?: vscode.TreeItem | ServiceGroup | Service | InjectionSite): vscode.ProviderResult<ServiceGroup[] | Service[] | InjectionSite[]> {
    if (!element) {
      return serviceProvider.getServiceGroups();
    } else if (isServiceGroup(element)) {
      return element.services;
    } else if (isService(element)) {
      return element.injectionSites;
    } else {
      return [];
    }
  }

  async refresh(): Promise<void> {
    await serviceProvider.refresh();
    this._onDidChangeTreeData.fire(undefined);
  }
}

// Global provider instance
export const diNavigatorProvider = new DINavigatorProvider();