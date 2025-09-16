import { ExtensionContext, Uri, workspace, RelativePattern } from 'vscode';
import * as path from 'path';
import {
  ProjectDI, ServiceGroup, Service,
  Registration, Conflict, Lifetime,
  Colors, InjectionSite
} from './models';
import {
  parseCsharp,
  extractRegistrations,
  extractInjectionSites
} from './parser';
import {
  CONFIG_SECTION, CONFIG_EXCLUDE_FOLDERS,
  DEFAULT_EXCLUDE_FOLDERS, GLOBAL_STATE_KEY, LIFETIMES
} from './const';


export class ServiceProvider {
  private projectDI: ProjectDI[] = [];
  private cache = new Map<string, ProjectDI[]>();
  private context: ExtensionContext | undefined;

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
    this.cache.clear();
  }

  private async parseFile(filePath: string): Promise<{ registrations: Registration[]; injectionSites: InjectionSite[] }> {
    const document = await workspace.openTextDocument(filePath);
    const sourceCode = document.getText();
    const regs = extractRegistrations(filePath, sourceCode);
    const sites = extractInjectionSites(filePath, sourceCode);
    return { registrations: regs, injectionSites: sites };
  }

  async collectRegistrations(): Promise<void> {
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
    console.log(`Total projects scanned: ${projectDI.length}, Total registrations: ${totalRegs}, Total injection sites: ${totalSites}`);
    if (projectDI.length === 0) {
      console.warn('No .NET projects found in workspace.');
    }
    this.cache.set('default', this.projectDI);
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

  getServiceGroups(): ServiceGroup[] {
    // Flat view for legacy support
    const allGroups: ServiceGroup[] = [];
    for (const project of this.projectDI) {
      allGroups.push(...project.serviceGroups);
    }
    return allGroups;
  }

  async refresh(): Promise<void> {
    await this.collectRegistrations();
  }
}

// Global instance
export const serviceProvider = new ServiceProvider();