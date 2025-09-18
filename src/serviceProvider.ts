import { ExtensionContext, workspace, RelativePattern } from 'vscode';
import * as path from 'path';
import {
  ProjectDI, ServiceGroup, Service,
  Lifetime, Colors
} from './models';
import { parseProject } from './parser';
import {
  CONFIG_SECTION, CONFIG_EXCLUDE_FOLDERS,
  DEFAULT_EXCLUDE_FOLDERS, GLOBAL_STATE_KEY, LIFETIMES
} from './const';

export class ServiceProvider {
  private projectDI: ProjectDI[] = [];
  private allServices: Service[] = [];
  private context: ExtensionContext | undefined;
  private dirty = false;
  private allProjectDirs: string[] = [];
  private dirtyProjects: Set<string> = new Set();

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
    this.allProjectDirs = [];
    this.dirtyProjects.clear();
  }

  // Removed legacy parseFile; now using parseProject

  async collectRegistrations(progress?: { report: (info: { increment?: number; message?: string; }) => void; }): Promise<void> {
    if (!this.context) {
      console.error('Extension context not set. Cannot access global state.');
      return;
    }

    const excludeGlob = this.getExcludeGlob();

    const allProjectDirs: string[] = [];
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
      console.warn('No workspace folders found.');
      return;
    }

    for (const folder of workspace.workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      try {
        const projectPattern = new RelativePattern(folder, '**/*.{csproj,sln}');
        const projectFiles = await workspace.findFiles(projectPattern, excludeGlob);

        const slnFiles = projectFiles.filter(f => f.fsPath.endsWith('.sln'));
        const csprojFiles = projectFiles.filter(f => f.fsPath.endsWith('.csproj'));
        console.log(`Found ${slnFiles.length} solution files and ${csprojFiles.length} project files in folder ${folder.name}`);
        console.log('Solution files:', slnFiles.map(f => f.fsPath));
        console.log('Project files:', csprojFiles.map(f => f.fsPath));
        const slnDirs = [...new Set(slnFiles.map(f => path.dirname(f.fsPath)))];
        const csprojDirs = csprojFiles.map(f => path.dirname(f.fsPath));

        // Filter csproj dirs that are under sln dirs within this folder
        const filteredCsprojDirs = csprojDirs.filter(dir => !slnDirs.some(slnDir => {
          const rel = path.relative(slnDir, dir);
          return rel !== '' && !rel.startsWith('..');
        }));

        // For sln, use the sln dir; for standalone csproj, use their dir
        const rootProjectDirs = [...slnDirs, ...filteredCsprojDirs].map(dir => path.resolve(folderPath, path.relative(folderPath, dir)));
        allProjectDirs.push(...rootProjectDirs);
      } catch (error) {
        console.error(`Error finding projects in folder ${folderPath}:`, error);
      }
    }

    if (allProjectDirs.length === 0) {
      console.warn('No .NET projects found in workspace folders.');
    }

    this.allProjectDirs = allProjectDirs;

    let toParse = allProjectDirs;
    if (this.dirtyProjects.size > 0) {
      toParse = allProjectDirs.filter(dir => this.dirtyProjects.has(dir));
    }
    if (this.dirty) {
      toParse = allProjectDirs;
    }
    if (toParse.length === 0) {
      return;
    }

    const totalProjects = toParse.length;
    let processedProjects = 0;
    for (const projectDir of toParse) {
      const projectName = path.basename(projectDir);
      const message = this.dirty ? `Parsing project ${projectName}` : `Updating project ${projectName}`;
      progress?.report({ increment: (processedProjects / totalProjects) * 100, message });
      console.log(message);
      const projectData = await parseProject(projectDir);
      const index = this.projectDI.findIndex(p => p.projectPath === projectDir);
      if (this.dirty || index === -1) {
        if (index > -1) {
          this.projectDI[index] = projectData;
        } else {
          this.projectDI.push(projectData);
        }
      } else {
        this.projectDI[index] = projectData;
      }
      processedProjects++;
      const regsCount = projectData.serviceGroups.reduce((sum, g) => sum + g.services.reduce((s, svc) => s + svc.registrations.length, 0), 0);
      const sitesCount = projectData.serviceGroups.reduce((sum, g) => sum + g.services.reduce((s, svc) => s + svc.injectionSites.length, 0), 0);

      console.log(`Project ${projectName}: ${regsCount} registrations, ${sitesCount} sites, ${projectData.cycles.length} cycles`);
      if (regsCount === 0) {
        console.warn(`No DI registrations found in project ${projectName}.`);
      }
    }
    this.dirtyProjects.clear();
    this.dirty = false;

    const totalRegs = this.projectDI.reduce((acc, p) => acc + p.serviceGroups.reduce((sum, g) => sum + g.services.reduce((s, svc) => s + svc.registrations.length, 0), 0), 0);

    const totalSites = this.projectDI.reduce((acc, p) => acc + p.serviceGroups.reduce((sum, g) => sum + g.services.reduce((s, svc) => s + svc.injectionSites.length, 0), 0), 0);

    progress?.report({ increment: 100, message: `Scan complete: ${this.projectDI.length} projects, ${totalRegs} registrations, ${totalSites} sites` });
    console.log(`Total projects parsed: ${this.projectDI.length}, Total registrations: ${totalRegs}, Total injection sites: ${totalSites}`);
    if (this.projectDI.length === 0) {
      console.warn('No .NET projects found in workspace.');
    }

    // Populate allServices
    this.allServices = [];
    for (const project of this.projectDI) {
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
    return this.projectDI.filter(project =>
      project.serviceGroups.some(group =>
        group.services.some(service => service.registrations.length > 0)
      )
    );
  }

  invalidateFile(filePath: string): void {
    let invalidatedProject = false;
    for (const projDir of this.allProjectDirs) {
      const rel = path.relative(projDir, filePath);
      if (rel !== '' && !rel.startsWith('..')) {
        this.dirtyProjects.add(projDir);
        invalidatedProject = true;
        break;
      }
    }
    if (!invalidatedProject) {
      this.dirty = true;
    }
    this.allServices = [];
    console.log(`Invalidated ${invalidatedProject ? 'project' : 'full cache'} due to change in ${filePath}`);
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

  // Removed; conflicts now handled in parseProject and collectRegistrations using graph

  getAllServices(): Service[] {
    return this.allServices;
  }

  async refresh(): Promise<void> {
    if (this.dirtyProjects.size > 0 || this.dirty) {
      await this.collectRegistrations();
    }
    this.dirty = false;
  }
}

// Global instance
export const serviceProvider = new ServiceProvider();