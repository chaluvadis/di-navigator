import { TreeItem, TreeDataProvider, EventEmitter, TreeItemCollapsibleState, ThemeIcon, ProviderResult } from 'vscode';
import { ServiceGroup, Service, InjectionSite } from './models';
import { serviceProvider } from './serviceProvider';
import {
  ICON_FOLDER, ICON_CLASS, ICON_WARNING,
  COMMAND_GO_TO_IMPL, TITLE_GO_TO_IMPL, ICON_METHOD,
  COMMAND_GO_TO_SITE, TITLE_GO_TO_SITE
} from './const';

const isServiceGroup = (element: any): element is ServiceGroup =>
  element?.lifetime !== undefined && Array.isArray(element.services);

const isInjectionSite = (element: any): element is InjectionSite =>
  element?.filePath !== undefined && element.lineNumber !== undefined;

const isService = (element: any): element is Service =>
  element?.name !== undefined && Array.isArray(element.registrations);

export class DINavigatorProvider implements TreeDataProvider<TreeItem | ServiceGroup | Service | InjectionSite> {
  private _onDidChangeTreeData = new EventEmitter<ServiceGroup | Service | InjectionSite | undefined>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: TreeItem | ServiceGroup | Service | InjectionSite): TreeItem {
    if (isServiceGroup(element)) {
      const groupItem = new TreeItem(element.lifetime, TreeItemCollapsibleState.Collapsed);
      groupItem.description = `${element.services.length} services`;
      groupItem.iconPath = new ThemeIcon(ICON_FOLDER);
      groupItem.resourceUri = undefined;
      return groupItem;
    } else if (isService(element)) {
      const serviceItem = new TreeItem(element.name, TreeItemCollapsibleState.Collapsed);
      serviceItem.description = `${element.registrations.length} registrations${element.injectionSites?.length ? `, ${element.injectionSites.length} injection sites` : ''}`;
      serviceItem.iconPath = new ThemeIcon(ICON_CLASS);
      if (element.hasConflicts) {
        serviceItem.iconPath = new ThemeIcon(ICON_WARNING);
      }
      // Command for navigation
      serviceItem.command = {
        command: COMMAND_GO_TO_IMPL,
        title: TITLE_GO_TO_IMPL,
        arguments: [element]
      };
      return serviceItem;
    } else if (isInjectionSite(element)) {
      const siteItem = new TreeItem(`${element.className}.${element.memberName} (${element.serviceType})`, TreeItemCollapsibleState.None);
      siteItem.description = `Line ${element.lineNumber}`;
      siteItem.iconPath = new ThemeIcon(ICON_METHOD);
      siteItem.command = {
        command: COMMAND_GO_TO_SITE,
        title: TITLE_GO_TO_SITE,
        arguments: [element]
      };
      return siteItem;
    }
    return element as TreeItem;
  }

  getChildren(element?: TreeItem | ServiceGroup | Service | InjectionSite)
    : ProviderResult<ServiceGroup[] | Service[] | InjectionSite[]> {
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