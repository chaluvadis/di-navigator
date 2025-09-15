import { ExtensionContext, Uri, workspace, RelativePattern } from 'vscode';
import * as CONSTANTS from './const';
import { ServiceGroup, Service, Registration, Lifetime, Colors, InjectionSite } from './models';
import { parseCsharp, extractRegistrations, extractInjectionSites } from './parser';
import path from 'path';
export class ServiceProvider {
  private serviceGroups: ServiceGroup[] = [];
  private cache = new Map<string, ServiceGroup[]>();
  private context: ExtensionContext | undefined;

  setContext(context: ExtensionContext): void {
    this.context = context;
  }
  getExcludeGlob(): string {
    const config = workspace.getConfiguration(CONSTANTS.CONFIG_SECTION);
    const patterns = config.get<string[]>(CONSTANTS.CONFIG_EXCLUDE_FOLDERS) ?? Array.from(CONSTANTS.DEFAULT_EXCLUDE_FOLDERS);
    return patterns.length > 1 ? `{${patterns.join(',')}}` : patterns[0];
  }
  clearState(): void {
    if (this.context) {
      this.context.globalState.update('diNavigator.selectedProject', undefined);
    }
    this.serviceGroups = [];
    this.cache.clear();
  }

  async collectRegistrations(): Promise<void> {
    if (!this.context) {
      console.error('Extension context not set. Cannot access global state.');
      return;
    }

    const registrations: Registration[] = [];

    // Get selected project from global state
    const selectedProject = this.context?.globalState.get(CONSTANTS.GLOBAL_STATE_KEY) as string | undefined;

    let csFiles: Uri[];
    if (selectedProject) {
      const { dir: projectDir } = path.parse(selectedProject);
      const projectUri = Uri.file(projectDir);
      const includePattern = new RelativePattern(projectUri, '**/*.cs');
      const excludeGlob = this.getExcludeGlob();
      csFiles = await workspace.findFiles(includePattern, excludeGlob);
      console.log(`Scoped to selected project: ${selectedProject}`);
    } else {
      const excludeGlob = this.getExcludeGlob();
      csFiles = await workspace.findFiles('**/*.cs', excludeGlob);
      console.log('Scanning entire workspace for DI registrations');
    }
    console.log(`Scanning ${csFiles.length} C# files for DI registrations`);

    let totalFiles = 0;
    let totalRegs = 0;
    let totalSites = 0;
    const allInjectionSites: InjectionSite[] = [];
    for (const file of csFiles) {
      totalFiles++;
      try {
        const document = await workspace.openTextDocument(file);
        const sourceCode = document.getText();
        const rootNode = parseCsharp(sourceCode);
        const fileRegs = extractRegistrations(rootNode, file.fsPath);
        totalRegs += fileRegs.length;
        registrations.push(...fileRegs);
        const fileSites = extractInjectionSites(rootNode, file.fsPath);
        totalSites += fileSites.length;
        allInjectionSites.push(...fileSites);
        if (fileRegs.length > 0) {
          console.log(`Parsed ${file.fsPath}: found ${fileRegs.length} registrations`);
        }
        if (fileSites.length > 0) {
          console.log(`Parsed ${file.fsPath}: found ${fileSites.length} injection sites`);
        }
      } catch (error) {
        console.error(`Error parsing ${file.fsPath}:`, error);
      }
    }
    console.log(`Total C# files scanned: ${totalFiles}, Total registrations found: ${totalRegs}, Total injection sites: ${totalSites}`);
    if (totalRegs === 0) {
      console.warn('No DI registrations found. Check if your .cs files have standard services.Add* calls.');
    }

    // Group into services
    const servicesByName = new Map<string, Service>();
    for (const reg of registrations) {
      let service = servicesByName.get(reg.serviceType) as Service;
      if (!service) {
        service = { name: reg.serviceType, registrations: [], hasConflicts: false, injectionSites: [] };
        servicesByName.set(reg.serviceType, service);
      }
      service.registrations.push(reg);
      // Basic conflict: multiple impls for same service in same lifetime
      const lifetimeImpls = service.registrations
        .filter(r => r.lifetime === reg.lifetime)
        .map(r => r.implementationType);
      if (new Set(lifetimeImpls).size > 1) {
        service.hasConflicts = true;
      }
    }

    // Associate injection sites with services
    for (const site of allInjectionSites) {
      const matchingService = Array.from(servicesByName.values()).find(s => s.name === site.serviceType);
      if (matchingService) {
        matchingService.injectionSites.push(site);
      }
    }

    // Group by lifetime, creating lifetime-specific service views to avoid duplication
    this.serviceGroups = [];
    for (const lifetime of CONSTANTS.LIFETIMES) {
      const lifeTimeServices: Service[] = [];
      for (const service of Array.from(servicesByName.values())) {
        const lifetimeRegs = service.registrations.filter(r => r.lifetime === lifetime);
        if (lifetimeRegs.length > 0) {
          const lifeTimeService: Service = {
            ...service,
            registrations: lifetimeRegs,
            hasConflicts: new Set(lifetimeRegs.map(r => r.implementationType)).size > 1
          };
          lifeTimeServices.push(lifeTimeService);
        }
      }
      if (lifeTimeServices.length > 0) {
        this.serviceGroups.push({
          lifetime,
          services: lifeTimeServices,
          color: this.getLifetimeColor(lifetime)
        });
      }
    }

    this.cache.set('default', this.serviceGroups);
    // Cache cleared only when needed; no immediate clear
  }

  private getLifetimeColor(lifetime: Lifetime): string {
    switch (lifetime) {
      case Lifetime.Singleton: return Colors.Singleton;
      case Lifetime.Scoped: return Colors.Scoped;
      case Lifetime.Transient: return Colors.Transient;
      default: return Colors.Default;
    }
  }

  getServiceGroups(): ServiceGroup[] {
    return this.serviceGroups;
  }

  async refresh(): Promise<void> {
    await this.collectRegistrations();
  }
}

// Global instance
export const serviceProvider = new ServiceProvider();