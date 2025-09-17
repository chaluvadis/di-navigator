import * as fs from 'fs';
import * as path from 'path';
import { Registration, InjectionSite, Service, ServiceGroup, ProjectDI, Lifetime, Colors } from './models';
import { LIFETIMES } from './const';
import { execSync } from 'child_process';

const getLifetimeFromString = (lifetimeStr: string): Lifetime => {
  switch (lifetimeStr) {
    case 'Singleton': return Lifetime.Singleton;
    case 'Scoped': return Lifetime.Scoped;
    case 'Transient': return Lifetime.Transient;
    default: return Lifetime.Transient;
  }
};

export const parseProject = (projectPath: string): ProjectDI => {
  const projectName = path.basename(projectPath);
  const registrations: Registration[] = [];
  const injectionSites: InjectionSite[] = [];
  const cycles: string[] = [];
  let dependencyGraph: Record<string, string[]> = {};

  try {
    // Primary: Roslyn tool
    const toolPath = path.join('.', 'tools', 'roslyn-di-analyzer', 'bin', 'Debug', 'net8.0', 'roslyn-di-analyzer.dll');
    if (!fs.existsSync(toolPath)) {
      throw new Error('Roslyn tool not built.');
    }

    const command = `dotnet "${toolPath}" --project "${projectPath}"`;
    const output = execSync(command, { encoding: 'utf8', cwd: path.dirname(projectPath) });
    const analysisResult = JSON.parse(output);

    // Map Registrations
    for (const reg of analysisResult.Registrations) {
      const lifetime = getLifetimeFromString(reg.Lifetime);
      registrations.push({
        id: reg.Id,
        lifetime,
        serviceType: reg.ServiceType,
        implementationType: reg.ImplementationType || reg.ServiceType,
        filePath: reg.FilePath,
        lineNumber: reg.LineNumber,
        methodCall: reg.MethodCall
      });
    }

    // Map InjectionSites
    for (const site of analysisResult.InjectionSites) {
      injectionSites.push({
        filePath: site.FilePath,
        lineNumber: site.LineNumber,
        className: site.ClassName,
        memberName: site.MemberName,
        type: site.Type as 'constructor' | 'method' | 'field',
        serviceType: site.ServiceType,
        linkedRegistrationIds: site.LinkedRegistrationIds || []
      });
    }

    cycles.push(...(analysisResult.Cycles || []));
    dependencyGraph = analysisResult.DependencyGraph || {};

    console.log(`Parsed project ${projectName}: ${registrations.length} registrations, ${injectionSites.length} sites, ${cycles.length} cycles`);
  } catch (error) {
    console.error(`Error parsing project ${projectPath}:`, error);
    // Fallback to regex scanning
    try {
      const csFiles = findCsFilesSync(projectPath);
      for (const filePath of csFiles) {
        const source = fs.readFileSync(filePath, 'utf8');
        // Registration regex for builder.Services or services
        const regRegex = /(builder\.Services|services)\.Add(?:Scoped|Singleton|Transient)<([^>]+)>(?:,\s*([^>]+))?\s*\(\s*(new\s+[^)]+)?\s*\)/g;
        let regMatch;
        while ((regMatch = regRegex.exec(source)) !== null) {
          const [, , serviceType, implType] = regMatch;
          const methodName = regMatch[0].match(/Add(\w+)/)?.[1] || 'Transient';
          const lifetime = getLifetimeFromString(methodName);
          const lineNumber = source.substring(0, regMatch.index).split('\n').length;
          registrations.push({
            id: `reg-${path.basename(filePath)}-${lineNumber}`,
            lifetime,
            serviceType: serviceType.trim(),
            implementationType: implType ? implType.trim() : serviceType.trim(),
            filePath,
            lineNumber,
            methodCall: regMatch[0]
          });
        }
        // Constructor injection regex
        const ctorRegex = /public\s+([^\s(]+)\s*\(\s*([^\)]+)\s*\)/g;
        let ctorMatch;
        while ((ctorMatch = ctorRegex.exec(source)) !== null) {
          const className = ctorMatch[1];
          const paramsStr = ctorMatch[2];
          const paramMatches = paramsStr.match(/([^\s,]+)\s+[\w]+/g) || [];
          const lineNumber = source.substring(0, ctorMatch.index).split('\n').length;
          for (const paramMatch of paramMatches) {
            const serviceType = paramMatch.trim();
            injectionSites.push({
              filePath,
              lineNumber,
              className,
              memberName: className,
              type: 'constructor',
              serviceType,
              linkedRegistrationIds: []
            });
          }
        }
      }
      console.log(`Fallback parsed ${registrations.length} registrations, ${injectionSites.length} sites for ${projectName}`);
    } catch (fallbackError) {
      console.error(`Fallback failed for ${projectPath}:`, fallbackError);
    }
  }

  // Aggregate into Services
  const servicesByType = new Map<string, Service>();
  for (const reg of registrations) {
    let service = servicesByType.get(reg.serviceType);
    if (!service) {
      service = {
        name: reg.serviceType,
        registrations: [],
        injectionSites: [],
        hasConflicts: false,
        conflicts: []
      };
      servicesByType.set(reg.serviceType, service);
    }
    service.registrations.push(reg);
  }

  // Associate injection sites
  for (const site of injectionSites) {
    const service = servicesByType.get(site.serviceType);
    if (service) {
      service.injectionSites.push(site);
    }
  }

  // Group by lifetime
  const serviceGroups: ServiceGroup[] = [];
  for (const lifetime of LIFETIMES) {
    const lifetimeServices = Array.from(servicesByType.values()).filter(s => s.registrations.some(r => r.lifetime === lifetime));
    if (lifetimeServices.length > 0) {
      serviceGroups.push({
        lifetime,
        services: lifetimeServices,
        color: getLifetimeColor(lifetime)
      });
    }
  }

  return {
    projectPath,
    projectName,
    serviceGroups,
    cycles,
    dependencyGraph
  };
};

const getLifetimeColor = (lifetime: Lifetime): string => {
  switch (lifetime) {
    case Lifetime.Singleton: return Colors.Singleton;
    case Lifetime.Scoped: return Colors.Scoped;
    case Lifetime.Transient: return Colors.Transient;
    case Lifetime.Others: return Colors.Others;
    default: return Colors.Default;
  }
};

function findCsFilesSync(dir: string): string[] {
  let files: string[] = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        files = files.concat(findCsFilesSync(fullPath));
      } else if (item.name.endsWith('.cs')) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  return files;
}

// Legacy exports
export const extractRegistrations = (): Registration[] => [];
export const extractInjectionSites = (): InjectionSite[] => [];
export const isValidDIMethod = (): boolean => false;
export const getLifetimeFromMethod = (): Lifetime => Lifetime.Transient;
export const parseCsharp = (): null => null;
export const isServicesChain = (): boolean => false;
export const extractTypeArguments = (): { serviceType: string; implType: string; } => ({ serviceType: '', implType: '' });
export const extractImplFromArguments = (_argList: any, serviceType: string): string => serviceType;
export const extractConstructorInjectionSites = (_constructorNode: any, _className: string, _filePath: string): InjectionSite[] => [];