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
import { getToolPath } from './utils';

export class ServiceProvider {
  private projectDI: ProjectDI[] = [];
  private allServices: Service[] = [];
  private context: ExtensionContext | undefined;
  private allProjectDirs: string[] = [];

  setContext = (context: ExtensionContext): void => { this.context = context; };
  getContext = (): ExtensionContext | undefined => this.context;
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
    this.allProjectDirs = [];
  }

  // Removed legacy parseFile; now using parseProject

  async collectRegistrations(progress?: { report: (info: { increment?: number; message?: string; }) => void; }): Promise<void> {
    if (!this.context) {
      return;
    }

    const allProjectDirs = await this.discoverProjectDirectories();
    this.allProjectDirs = allProjectDirs;

    const toParse = this.determineProjectsToParse(allProjectDirs);

    if (toParse.length === 0) {
      return;
    }

    const toolPath = getToolPath(this.context);

    for (let processedProjects = 0; processedProjects < toParse.length; processedProjects++) {
      const projectDir = toParse[processedProjects];
      await this.processProject(projectDir, toolPath, progress);
    }

    const totalRegs = this.countTotalRegistrations();
    const totalSites = this.countTotalInjectionSites();

    progress?.report({
      increment: 100,
      message: `Scan complete: ${this.projectDI.length} projects, ${totalRegs} registrations, ${totalSites} sites`
    });

    this.populateAllServices();
  }

  private getLifetimeColor(lifetime: Lifetime): string {
    switch (lifetime) {
      case Lifetime.Singleton: return Colors.Singleton;
      case Lifetime.Scoped: return Colors.Scoped;
      case Lifetime.Transient: return Colors.Transient;
      default: return Colors.Default;
    }
  }

  private countRegistrationsInProject(project: ProjectDI): number {
    return project.serviceGroups.reduce((sum, g) =>
      sum + g.services.reduce((s, svc) => s + svc.registrations.length, 0), 0);
  }

  private countInjectionSitesInProject(project: ProjectDI): number {
    return project.serviceGroups.reduce((sum, g) =>
      sum + g.services.reduce((s, svc) => s + svc.injectionSites.length, 0), 0);
  }

  private countTotalRegistrations(): number {
    return this.projectDI.reduce((acc, p) => acc + this.countRegistrationsInProject(p), 0);
  }

  private countTotalInjectionSites(): number {
    return this.projectDI.reduce((acc, p) => acc + this.countInjectionSitesInProject(p), 0);
  }

  private filterProjectDirectories(slnDirs: string[], csprojDirs: string[], folderPath: string): string[] {
    // Filter csproj dirs that are under sln dirs within this folder
    const filteredCsprojDirs = csprojDirs.filter(dir => !slnDirs.some(slnDir => {
      const rel = path.relative(slnDir, dir);
      return rel !== '' && !rel.startsWith('..');
    }));

    // For sln, use the sln dir; for standalone csproj, use their dir
    return [...slnDirs, ...filteredCsprojDirs].map(dir => path.resolve(folderPath, path.relative(folderPath, dir)));
  }

  private filterServicesByLifetime(services: Service[], lifetime: Lifetime): Service[] {
    return services.filter(s => s.registrations.some(r => r.lifetime === lifetime));
  }

  private updateProjectData(projectDir: string, projectData: ProjectDI): void {
    const index = this.projectDI.findIndex(p => p.projectPath === projectDir);
    if (index > -1) {
      this.projectDI[index] = projectData;
    } else {
      this.projectDI.push(projectData);
    }
  }

  private async discoverProjectDirectories(): Promise<string[]> {
    const allProjectDirs: string[] = [];
    if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
      return allProjectDirs;
    }

    const excludeGlob = this.getExcludeGlob();

    for (const folder of workspace.workspaceFolders) {
      const folderPath = folder.uri.fsPath;
      try {
        const projectPattern = new RelativePattern(folder, '**/*.{csproj,sln}');
        const projectFiles = await workspace.findFiles(projectPattern, excludeGlob);

        const slnFiles = projectFiles.filter(f => f.fsPath.endsWith('.sln'));
        const csprojFiles = projectFiles.filter(f => f.fsPath.endsWith('.csproj'));

        const slnDirs = [...new Set(slnFiles.map(f => path.dirname(f.fsPath)))];
        const csprojDirs = csprojFiles.map(f => path.dirname(f.fsPath));

        const rootProjectDirs = this.filterProjectDirectories(slnDirs, csprojDirs, folderPath);
        allProjectDirs.push(...rootProjectDirs);
      } catch (error) {
        this.handleProjectDiscoveryError(folderPath, error);
      }
    }

    return allProjectDirs;
  }

  private determineProjectsToParse(allProjectDirs: string[]): string[] {
    return allProjectDirs;
  }

  private calculateProgressPercentage(processedProjects: number, totalProjects: number): number {
    return totalProjects > 0 ? (processedProjects / totalProjects) * 100 : 0;
  }

  private async processProject(projectDir: string, toolPath: string, progress?: { report: (info: { increment?: number; message?: string; }) => void; }): Promise<void> {
    const projectName = path.basename(projectDir);
    const message = `Parsing project ${projectName}`;
    progress?.report({ increment: this.calculateProgressPercentage(0, 1), message });

    try {
      const projectData = await parseProject(projectDir, toolPath);

      this.updateProjectData(projectDir, projectData);

      const regsCount = this.countRegistrationsInProject(projectData);
      const sitesCount = this.countInjectionSitesInProject(projectData);

      if (regsCount === 0) {
        this.logWarning(`No DI registrations found in project ${projectName}.`);
      }
    } catch (error) {
      this.handleProjectProcessingError(projectDir, error);
    }
  }

  private populateAllServices(): void {
    this.allServices = [];
    for (const project of this.projectDI) {
      for (const group of project.serviceGroups) {
        this.allServices.push(...group.services);
      }
    }
  }

  private logError(message: string, error?: any): void {
    const errorMessage = error ? `${message}: ${error}` : message;
    console.error(errorMessage);
  }

  private logWarning(message: string): void {
    console.warn(message);
  }

  private logInfo(message: string, ...args: any[]): void {
    if (args.length > 0) {
      console.log(message, ...args);
    } else {
      console.log(message);
    }
  }

  private handleProjectDiscoveryError(folderPath: string, error: any): void {
    this.logError(`Error finding projects in folder ${folderPath}`, error);
  }

  private handleProjectProcessingError(projectDir: string, error: any): void {
    this.logError(`Error processing project ${projectDir}`, error);
  }

  getProjectDI(): ProjectDI[] {
    if (this.projectDI.length === 0) {
      return [];
    }

    return this.projectDI;
  }


  getServiceGroups(): ServiceGroup[] {
    if (this.projectDI.length === 0) {
      // Test mode: lazy loading with counts
      const groups: ServiceGroup[] = [];
      for (const lifetime of LIFETIMES) {
        const count = this.filterServicesByLifetime(this.allServices, lifetime).length;
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
    return this.filterServicesByLifetime(this.allServices, lifetime);
  }
  getAllServices(): Service[] {
    return this.allServices;
  }

  async refresh(): Promise<void> {
    await this.collectRegistrations();
  }
}

// Global instance
export const serviceProvider = new ServiceProvider();