import { ExtensionContext, Uri, workspace, RelativePattern } from 'vscode';
import * as path from 'path';
import {
  ProjectDI, ServiceGroup, Service,
  Registration, Conflict, Lifetime,
  Colors, InjectionSite
} from './models';
import {
  extractRegistrations,
  extractInjectionSites
} from './parser';
import {
  CONFIG_SECTION, CONFIG_EXCLUDE_FOLDERS,
  DEFAULT_EXCLUDE_FOLDERS, GLOBAL_STATE_KEY, LIFETIMES
} from './const';


export class ServiceProvider {
  private projectDI: ProjectDI[] = [];
  private allServices: Service[] = [];
  private cache = new Map<string, ProjectDI[]>();
  private context: ExtensionContext | undefined;
  private dirty = false;

  setContext(context: ExtensionContext): void {
    this.context = context;
  }

  getExcludeGlob(): string {
    const config = workspace.getConfiguration(CONFIG_SECTION);
    const patterns = config.get<string[]>(CONFIG_EXCLUDE_FOLDERS) ?? Array.from(DEFAULT_EXCLUDE_FOLDERS);
    return patterns.length > 1 ? `{${patterns.join(',')}}` : patterns[0];
  }

  clearState(): void {
    if (this.context) {
      this.context.globalState.update(GLOBAL_STATE_KEY, undefined);
    }
    this.projectDI = [];
    this.allServices = [];
    this.dirty = false;
    this.cache.clear();
  }

  private async parseFile(filePath: string): Promise<{ registrations: Registration[]; injectionSites: InjectionSite[]; }> {
    const document = await workspace.openTextDocument(filePath);
    const sourceCode = document.getText();
    const regs = extractRegistrations(filePath, sourceCode);
    const sites = extractInjectionSites(filePath, sourceCode);
    return { registrations: regs, injectionSites: sites };
  }

  async collectRegistrations(progress?: { report: (info: { increment?: number; message?: string; }) => void; }): Promise<void> {
    if (!this.context) {
      console.error('Extension context not set. Cannot access global state.');
      return;
    }

    const excludeGlob = this.getExcludeGlob();

    const allProjectDirs: string[] = [];
    try {
      const csprojFiles = await workspace.findFiles('**/*.csproj', excludeGlob);
      const slnFiles = await workspace.findFiles('**/*.sln', excludeGlob);
      const allFiles = [...csprojFiles, ...slnFiles];
      const uniqueDirs = new Set(allFiles.map(f => path.dirname(f.fsPath)));
      uniqueDirs.forEach(d => allProjectDirs.push(d));
    } catch (error) {
      console.error('Error finding projects:', error);
    }

    if (allProjectDirs.length === 0 && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
      allProjectDirs.push(workspace.workspaceFolders[0].uri.fsPath);
    }

    const projectDI: ProjectDI[] = [];
    let totalFiles = 0;
    let totalRegs = 0;
    let totalSites = 0;
    for (const projectDir of allProjectDirs) {
      const projectUri = Uri.file(projectDir);
      const projectName = path.basename(projectDir);
      const includePattern = new RelativePattern(projectUri, '**/*.cs');
      let csFiles: Uri[];
      try {
        csFiles = await workspace.findFiles(includePattern, excludeGlob);
      } catch (error) {
        console.error(`Error finding files in ${projectDir}:`, error);
        continue;
      }
      progress?.report({ increment: 0, message: `Scanning ${csFiles.length} C# files in project ${projectName}` });
      console.log(`Scanning ${csFiles.length} C# files in project ${projectName}`);
      const projectRegs: Registration[] = [];
      const projectInjectionSites: InjectionSite[] = [];
      let projectTotalFiles = 0;
      let projectTotalRegs = 0;
      let projectTotalSites = 0;
      for (const file of csFiles) {
        projectTotalFiles++;
        totalFiles++;
        try {
          const parseResult = await this.parseFile(file.fsPath);
          const fileRegs = parseResult.registrations;
          const fileSites = parseResult.injectionSites;
          progress?.report({ message: `Parsed ${path.basename(file.fsPath)}: ${fileRegs.length} registrations, ${fileSites.length} sites` });
          console.log(`Parsed ${file.fsPath} with JS parser: ${fileRegs.length} registrations, ${fileSites.length} sites`);
          projectTotalRegs += fileRegs.length;
          totalRegs += fileRegs.length;
          projectRegs.push(...fileRegs);
          projectTotalSites += fileSites.length;
          totalSites += fileSites.length;
          projectInjectionSites.push(...fileSites);
          if (fileRegs.length > 0) {
            console.log(`Found ${fileRegs.length} registrations in ${file.fsPath}`);
          }
          if (fileSites.length > 0) {
            console.log(`Found ${fileSites.length} injection sites in ${file.fsPath}`);
          }
        } catch (error) {
          console.error(`Error parsing ${file.fsPath}:`, error);
        }
      }
      console.log(`Project ${projectName}: ${projectTotalFiles} files, ${projectTotalRegs} registrations, ${projectTotalSites} sites`);
      if (projectTotalRegs === 0) {
        console.warn(`No DI registrations found in project ${projectName}.`);
        continue;
      }

      // Group into services for this project
      const servicesByName = new Map<string, Service>();
      for (const reg of projectRegs) {
        let service = servicesByName.get(reg.serviceType) as Service;
        if (!service) {
          service = { name: reg.serviceType, registrations: [], hasConflicts: false, conflicts: [], injectionSites: [] };
          servicesByName.set(reg.serviceType, service);
        }
        service.registrations.push(reg);
      }

      // Associate injection sites for this project
      for (const site of projectInjectionSites) {
        const matchingService = Array.from(servicesByName.values()).find(s => s.name === site.serviceType);
        if (matchingService) {
          matchingService.injectionSites.push(site);
        }
      }

      // Detect conflicts for this project
      for (const service of servicesByName.values()) {
        const lifetimeGroups = new Map<Lifetime, Map<string, Registration[]>>();
        for (const reg of service.registrations) {
          if (!lifetimeGroups.has(reg.lifetime)) {
            lifetimeGroups.set(reg.lifetime, new Map());
          }
          const lifetimeMap = lifetimeGroups.get(reg.lifetime)!;
          if (!lifetimeMap.has(reg.implementationType)) {
            lifetimeMap.set(reg.implementationType, []);
          }
          lifetimeMap.get(reg.implementationType)!.push(reg);
        }

        for (const [lifetime, implMap] of lifetimeGroups) {
          for (const [implType, implRegs] of implMap) {
            if (implRegs.length > 1) {
              const conflict: Conflict = {
                type: 'DuplicateImplementation',
                details: `Multiple registrations for ${implType} as ${lifetime}: ${implRegs.map(r => `${r.filePath}:${r.lineNumber}`).join(', ')}`
              };
              service.conflicts!.push(conflict);
              service.hasConflicts = true;
            }
          }

          if (implMap.size > 1) {
            const conflict: Conflict = {
              type: 'MultipleImplementations',
              details: `Multiple different implementations for ${service.name} as ${lifetime}: ${Array.from(implMap.keys()).join(', ')}`
            };
            service.conflicts!.push(conflict);
            service.hasConflicts = true;
          }
        }

        if (service.registrations.length > 0 && service.injectionSites.length === 0) {
          const conflict: Conflict = {
            type: 'UnusedService',
            details: `Service ${service.name} has registrations but no injection sites found. May be unused.`
          };
          service.conflicts!.push(conflict);
          // Do not set hasConflicts for unused services to avoid warning icon
        }
      }

      // Group by lifetime for this project
      const projectServiceGroups: ServiceGroup[] = [];
      for (const lifetime of LIFETIMES) {
        const lifeTimeServices: Service[] = [];
        for (const service of Array.from(servicesByName.values())) {
          const lifetimeRegs = service.registrations.filter(r => r.lifetime === lifetime);
          if (lifetimeRegs.length > 0) {
            const lifeTimeService: Service = {
              ...service,
              registrations: lifetimeRegs,
              hasConflicts: service.hasConflicts
            };
            lifeTimeServices.push(lifeTimeService);
          }
        }
        if (lifeTimeServices.length > 0) {
          projectServiceGroups.push({
            lifetime,
            services: lifeTimeServices,
            color: this.getLifetimeColor(lifetime)
          });
        }
      }

      projectDI.push({
        projectPath: projectDir,
        projectName,
        serviceGroups: projectServiceGroups
      });
    }

    this.projectDI = projectDI;
    progress?.report({ increment: 100, message: `Scan complete: ${projectDI.length} projects, ${totalRegs} registrations` });
    console.log(`Total projects scanned: ${projectDI.length}, Total registrations: ${totalRegs}, Total injection sites: ${totalSites}`);
    if (projectDI.length === 0) {
      console.warn('No .NET projects found in workspace.');
    }
    this.cache.set('default', this.projectDI);

    // Populate allServices
    this.allServices = [];
    for (const project of projectDI) {
      for (const group of project.serviceGroups) {
        this.allServices.push(...group.services);
      }
    }
  }

  private getLifetimeColor(lifetime: Lifetime): string {
    switch (lifetime) {
      case Lifetime.Singleton: return Colors.Singleton;
      case Lifetime.Scoped: return Colors.Scoped;
      case Lifetime.Transient: return Colors.Transient;
      default: return Colors.Default;
    }
  }

  getProjectDI(): ProjectDI[] {
  	return this.projectDI;
  }
 
  invalidateFile(filePath: string): void {
  	this.dirty = true;
  	this.cache.clear();
  	this.allServices = [];
  	console.log(`Invalidated cache due to change in ${filePath}`);
  }

  getServiceGroups(): ServiceGroup[] {
    if (this.projectDI.length === 0) {
      // Test mode: lazy loading with counts
      const groups: ServiceGroup[] = [];
      for (const lifetime of LIFETIMES) {
        const count = this.allServices.filter(s => s.registrations.some(r => r.lifetime === lifetime)).length;
        if (count > 0) {
          groups.push({
            lifetime,
            services: [],
            color: this.getLifetimeColor(lifetime),
            count
          });
        }
      }
      return groups;
    } else {
      // Normal mode
      const allGroups: ServiceGroup[] = [];
      for (const project of this.projectDI) {
        for (const group of project.serviceGroups) {
          allGroups.push({
            ...group,
            count: group.services.length
          });
        }
      }
      return allGroups;
    }
  }

  getServicesForLifetime(lifetime: Lifetime): Service[] {
    return this.allServices.filter(s => s.registrations.some(r => r.lifetime === lifetime));
  }

  buildGraphAndConflicts(servicesByName: Map<string, Service>): void {
    for (const service of servicesByName.values()) {
      if (service.registrations.length > 0 && service.injectionSites.length === 0) {
        service.hasConflicts = true;
        if (!service.conflicts) {
          service.conflicts = [];
        }
        service.conflicts.push({
          type: 'Unused',
          details: `Service ${service.name} has registrations but no injection sites.`
        });
      }
    }
  }

  getAllServices(): Service[] {
    return this.allServices;
  }

  async refresh(): Promise<void> {
    if (!this.dirty && this.context) {
      const cacheKey = 'diCache';
      const cached = this.context.workspaceState.get<{ data: ProjectDI[]; timestamp: number; }>(cacheKey);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 min TTL
        this.projectDI = cached.data;
        // Repopulate allServices
        this.allServices = [];
        for (const project of this.projectDI) {
          for (const group of project.serviceGroups) {
            this.allServices.push(...group.services);
          }
        }
        return;
      }
    }
    await this.collectRegistrations();
    if (this.context) {
      const cacheKey = 'diCache';
      this.context.workspaceState.update(cacheKey, {
        data: this.projectDI,
        timestamp: Date.now()
      });
    }
    this.dirty = false;
  }
}

// Global instance
export const serviceProvider = new ServiceProvider();