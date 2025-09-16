import {
  TreeItem, TreeDataProvider, EventEmitter,
  TreeItemCollapsibleState, ThemeIcon, ProviderResult
} from 'vscode';
import { ProjectDI, ServiceGroup, Service, InjectionSite, Conflict } from './models';
import { serviceProvider } from './serviceProvider';
import {
  ICON_FOLDER, ICON_CLASS, ICON_WARNING,
  COMMAND_GO_TO_IMPL, TITLE_GO_TO_IMPL, ICON_METHOD,
  COMMAND_GO_TO_SITE, TITLE_GO_TO_SITE
} from './const';

interface ConflictItem {
  type: string;
  details: string;
}

const getConflictItems = (conflicts: Conflict[]): ConflictItem[] => {
  return conflicts.map(conflict => ({
    type: conflict.type,
    details: conflict.details
  }));
};

const isProjectDI = (element: any): element is ProjectDI =>
  element?.projectPath !== undefined && Array.isArray(element.serviceGroups);

const isServiceGroup = (element: any): element is ServiceGroup =>
  element?.lifetime !== undefined && Array.isArray(element.services);

const isInjectionSite = (element: any): element is InjectionSite =>
  element?.filePath !== undefined && element.lineNumber !== undefined;

const isService = (element: any): element is Service =>
  element?.name !== undefined && Array.isArray(element.registrations);

const isConflictItem = (element: any): element is ConflictItem =>
  element?.type !== undefined && element?.details !== undefined;

export class DINavigatorProvider implements TreeDataProvider<TreeItem | ProjectDI | ServiceGroup | Service | InjectionSite | ConflictItem> {
  private _onDidChangeTreeData = new EventEmitter<ProjectDI | ServiceGroup | Service | InjectionSite | ConflictItem | undefined>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: TreeItem | ProjectDI | ServiceGroup | Service | InjectionSite | ConflictItem): TreeItem {
    if (isProjectDI(element)) {
      const projectItem = new TreeItem(element.projectName, TreeItemCollapsibleState.Collapsed);
      let totalServices = 0;
      element.serviceGroups.forEach(g => totalServices += g.services.length);
      projectItem.description = `${element.serviceGroups.length} lifetimes, ${totalServices} services`;
      projectItem.iconPath = new ThemeIcon('file-directory');
      projectItem.tooltip = element.projectPath;
      return projectItem;
    } else if (isServiceGroup(element)) {
      const groupItem = new TreeItem(element.lifetime, TreeItemCollapsibleState.Collapsed);
      groupItem.description = `${element.services.length} services`;
      groupItem.iconPath = new ThemeIcon(ICON_FOLDER);
      groupItem.resourceUri = undefined;
      return groupItem;
    } else if (isService(element)) {
      const serviceItem = new TreeItem(element.name, TreeItemCollapsibleState.Collapsed);
      serviceItem.description = `${element.registrations.length} registrations${element.injectionSites?.length ? `, ${element.injectionSites.length} injection sites` : ''}${element.hasConflicts ? `, ${element.conflicts?.length || 0} conflicts` : ''}`;
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
    } else if (isConflictItem(element)) {
      const conflictItem = new TreeItem(`${element.type}`, TreeItemCollapsibleState.None);
      conflictItem.description = element.details;
      conflictItem.iconPath = new ThemeIcon(ICON_WARNING);
      conflictItem.tooltip = element.details;
      return conflictItem;
    }
    return element as TreeItem;
  }

  getChildren(element?: TreeItem | ProjectDI | ServiceGroup | Service | InjectionSite | ConflictItem)
    : ProviderResult<ProjectDI[] | ServiceGroup[] | Service[] | (InjectionSite | ConflictItem)[]> {
    if (!element) {
      return serviceProvider.getProjectDI();
    } else if (isProjectDI(element)) {
      return element.serviceGroups;
    } else if (isServiceGroup(element)) {
      return element.services;
    } else if (isService(element)) {
      const children: (InjectionSite | ConflictItem)[] = [...(element.injectionSites || [])];
      if (element.hasConflicts && element.conflicts && element.conflicts.length > 0) {
        children.push(...getConflictItems(element.conflicts));
      }
      return children;
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