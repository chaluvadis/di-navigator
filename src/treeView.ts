import {
  TreeItem, TreeDataProvider, EventEmitter,
  TreeItemCollapsibleState, ThemeIcon, ProviderResult
} from 'vscode';
import {
  ProjectDI, ServiceGroup,
  Service, InjectionSite,
  Conflict, ConflictItem,
  DiNavigatorItem
} from './models';
import {
  ICON_FOLDER, ICON_CLASS, ICON_WARNING,
  COMMAND_GO_TO_IMPL, TITLE_GO_TO_IMPL, ICON_METHOD,
  COMMAND_GO_TO_SITE, TITLE_GO_TO_SITE
} from './const';
import { serviceProvider } from './serviceProvider';

// Helper function to create TreeItem with common properties
const createTreeItem = (
  label: string,
  collapsibleState: TreeItemCollapsibleState,
  options: {
    description?: string;
    iconPath?: ThemeIcon;
    tooltip?: string;
    command?: { command: string; title: string; arguments: any[]; };
    contextValue?: string;
  } = {}
): TreeItem => {
  const item = new TreeItem(label, collapsibleState);
  if (options.description) {
    item.description = options.description;
  }
  if (options.iconPath) {
    item.iconPath = options.iconPath;
  }
  if (options.tooltip) {
    item.tooltip = options.tooltip;
  }
  if (options.command) {
    item.command = options.command;
  }
  if (options.contextValue) {
    item.contextValue = options.contextValue;
  }
  return item;
};

// Helper function to build description with counts
const buildDescription = (counts: Array<{ label: string; value: number; }>): string => {
  return counts
    .filter(({ value }) => value > 0)
    .map(({ label, value }) => `${value} ${label}`)
    .join(', ');
};

// Helper function to determine if warning icon should be used
const shouldShowWarning = (element: any): boolean => {
  if (isProjectDI(element)) {
    return element.cycles && element.cycles.length > 0;
  }
  if (isService(element)) {
    return element.hasConflicts;
  }
  return false;
};

// Helper function to get warning icon
const getWarningIcon = (): ThemeIcon => new ThemeIcon(ICON_WARNING);

// Helper function to create navigation command
const createNavigationCommand = (
  command: string,
  title: string,
  args: any[]
) => ({
  command,
  title,
  arguments: args
});

// Helper function to handle cycle detection and creation
const createCycleNode = (project: ProjectDI): TreeItem | null => {
  if (!project.cycles || project.cycles.length === 0) {
    return null;
  }

  return createTreeItem('Cycles', TreeItemCollapsibleState.Collapsed, {
    description: `${project.cycles.length} cycles detected`,
    iconPath: getWarningIcon(),
    contextValue: project.projectPath
  });
};

const getConflictItems = (conflicts: Conflict[]): ConflictItem[] => {
  return conflicts.map(conflict => ({
    type: conflict.type,
    details: conflict.details
  }));
};

// Generic type guard factory for checking required properties
const hasRequiredProps = <T>(element: any, requiredProps: (keyof T)[]): element is T => {
  return requiredProps.every(prop => element?.[prop] !== undefined);
};

// Type-specific type guards using the generic factory
const isProjectDI = (element: any): element is ProjectDI => {
  return hasRequiredProps<ProjectDI>(element, ['projectPath']) && Array.isArray(element.serviceGroups);
};

const isServiceGroup = (element: any): element is ServiceGroup => {
  return hasRequiredProps<ServiceGroup>(element, ['lifetime']) && Array.isArray(element.services);
};

const isInjectionSite = (element: any): element is InjectionSite => {
  return hasRequiredProps<InjectionSite>(element, ['filePath', 'lineNumber']);
};

const isService = (element: any): element is Service => {
  return hasRequiredProps<Service>(element, ['name']) && Array.isArray(element.registrations);
};

const isConflictItem = (element: any): element is ConflictItem => {
  return hasRequiredProps<ConflictItem>(element, ['type', 'details']);
};

const isTreeItem = (element: any): element is TreeItem => element instanceof TreeItem;

export class DINavigatorProvider implements TreeDataProvider<DiNavigatorItem> {
  private _onDidChangeTreeData = new EventEmitter<DiNavigatorItem | undefined>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  getTreeItem(element: DiNavigatorItem): TreeItem {
    if (isProjectDI(element)) {
      let totalServices = 0;
      element.serviceGroups.forEach(g => totalServices += g.services.length);

      const graph = element.dependencyGraph;
      const graphInfo = graph ? (() => {
        const nodes = Object.keys(graph).length;
        const edges = Object.values(graph).reduce((acc, deps) => acc + deps.length, 0);
        return { nodes, edges, tooltip: `${element.projectPath}\nDependency Graph: ${nodes} nodes, ${edges} edges` };
      })() : null;

      const descriptionParts = [
        { label: 'lifetimes', value: element.serviceGroups.length },
        { label: 'services', value: totalServices }
      ];

      if (element.cycles && element.cycles.length > 0) {
        descriptionParts.push({ label: 'cycles', value: element.cycles.length });
      }

      if (graphInfo) {
        descriptionParts.push({ label: 'nodes', value: graphInfo.nodes });
        descriptionParts.push({ label: 'edges', value: graphInfo.edges });
      }

      // Add info if no services found at all
      if (totalServices === 0) {
        descriptionParts.push({ label: 'No services found', value: 1 });
      } else {
        // Check if services exist but no DI registrations detected
        const hasRegistrations = element.serviceGroups.some(group =>
          group.services.some(service => service.registrations.length > 0)
        );
        if (!hasRegistrations) {
          descriptionParts.push({ label: 'No DI registrations detected', value: 1 });
        }
      }

      const description = buildDescription(descriptionParts);

      const iconPath = (() => {
        if (shouldShowWarning(element)) {
          return getWarningIcon();
        }
        if (totalServices === 0) {
          return new ThemeIcon('info');
        }
        // Check if services exist but no DI registrations detected
        const hasRegistrations = element.serviceGroups.some(group =>
          group.services.some(service => service.registrations.length > 0)
        );
        if (!hasRegistrations) {
          return getWarningIcon();
        }
        return new ThemeIcon('file-directory');
      })();

      return createTreeItem(element.projectName, TreeItemCollapsibleState.Collapsed, {
        description,
        iconPath,
        tooltip: graphInfo?.tooltip || element.projectPath
      });
    } else if (isServiceGroup(element)) {
      return createTreeItem(element.lifetime, TreeItemCollapsibleState.Collapsed, {
        description: buildDescription([{ label: 'services', value: element.services.length }]),
        iconPath: new ThemeIcon(ICON_FOLDER)
      });
    } else if (isService(element)) {
      const descriptionParts = [
        { label: 'registrations', value: element.registrations.length }
      ];

      if (element.injectionSites?.length) {
        descriptionParts.push({ label: 'injection sites', value: element.injectionSites.length });
      }

      if (element.hasConflicts) {
        descriptionParts.push({ label: 'conflicts', value: element.conflicts?.length || 0 });
      }

      return createTreeItem(element.name, TreeItemCollapsibleState.Collapsed, {
        description: buildDescription(descriptionParts),
        iconPath: shouldShowWarning(element) ? getWarningIcon() : new ThemeIcon(ICON_CLASS),
        command: createNavigationCommand(COMMAND_GO_TO_IMPL, TITLE_GO_TO_IMPL, [element])
      });
    } else if (isInjectionSite(element)) {
      return createTreeItem(
        `${element.className}.${element.memberName} (${element.serviceType})`,
        TreeItemCollapsibleState.None,
        {
          description: `Line ${element.lineNumber}`,
          iconPath: new ThemeIcon(ICON_METHOD),
          command: createNavigationCommand(COMMAND_GO_TO_SITE, TITLE_GO_TO_SITE, [element])
        }
      );
    } else if (isConflictItem(element)) {
      return createTreeItem(element.type, TreeItemCollapsibleState.None, {
        description: element.details,
        iconPath: getWarningIcon(),
        tooltip: element.details
      });
    }
    return element as TreeItem;
  }

  getChildren(element?: DiNavigatorItem)
    : ProviderResult<DiNavigatorItem[]> {

    if (!element) {
      const projects = serviceProvider.getProjectDI();

      // Show projects even if they don't have DI registrations detected
      if (projects.length === 0) {
        return [
          createTreeItem('No .NET Projects Found', TreeItemCollapsibleState.None, {
            description: 'Open a workspace with .csproj or .sln files to see DI analysis',
            iconPath: new ThemeIcon('info'),
            tooltip: 'The DI Navigator extension is active but no .NET projects were found in the current workspace. Open a .NET project to see dependency injection analysis.'
          })
        ];
      }

      // Check if any projects have DI registrations
      const projectsWithRegistrations = projects.filter(project =>
        project.serviceGroups.some(group =>
          group.services.some(service => service.registrations.length > 0)
        )
      );

      if (projectsWithRegistrations.length === 0 && projects.length > 0) {
        return [
          createTreeItem('Projects Found - No DI Registrations Detected', TreeItemCollapsibleState.None, {
            description: `${projects.length} project${projects.length > 1 ? 's' : ''} found, but no DI registrations detected`,
            iconPath: new ThemeIcon('warning'),
            tooltip: 'Projects were found but no dependency injection registrations were detected. This could be due to:\n• Using custom DI registration methods not recognized by the parser\n• DI registrations in external assemblies\n• Projects without DI containers\n\nCheck the console logs for parsing details.'
          }),
          ...projects
        ];
      }

      return projects;
    } else if (isProjectDI(element)) {
      const children: (ServiceGroup | TreeItem)[] = [...element.serviceGroups];
      const cycleNode = createCycleNode(element);
      if (cycleNode) {
        children.push(cycleNode);
      }
      return children;
    } else if (isServiceGroup(element)) {
      return element.services;
    } else if (isService(element)) {
      const children: (InjectionSite | ConflictItem)[] = [...(element.injectionSites || [])];
      if (element.hasConflicts && element.conflicts && element.conflicts.length > 0) {
        children.push(...getConflictItems(element.conflicts));
      }
      return children;
    } else if (isTreeItem(element) && element.contextValue && typeof element.contextValue === 'string' && element.label === 'Cycles') {
      const project = serviceProvider.getProjectDI().find(p => p.projectPath === element.contextValue);
      if (project && project.cycles) {
        return project.cycles.map(cycle => {
          const cycleItem: ConflictItem = {
            type: 'Cycle',
            details: cycle
          };
          return createTreeItem(cycle, TreeItemCollapsibleState.None, {
            description: cycle,
            iconPath: getWarningIcon(),
            tooltip: cycle
          });
        });
      }
      return [];
    } else {
      return [];
    }
  }

  async refresh(): Promise<void> {
    // Avoid double scan; just fire event to refresh TreeView from current data
    this._onDidChangeTreeData.fire(undefined);
  }
}

// Global provider instance
export const diNavigatorProvider = new DINavigatorProvider();