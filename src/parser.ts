import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import * as path from 'path';
import { Registration, InjectionSite, Service, ServiceGroup, ProjectDI, Lifetime, Colors } from './models';
import { LIFETIMES, CONFIG_EXCLUDE_FOLDERS, DEFAULT_EXCLUDE_FOLDERS } from './const';
import { RelativePattern, Uri, workspace, window } from 'vscode';

export const getLifetimeFromString = (lifetimeStr: string): Lifetime => {
  switch (lifetimeStr) {
    case 'Singleton': return Lifetime.Singleton;
    case 'Scoped': return Lifetime.Scoped;
    case 'Transient': return Lifetime.Transient;
    default: return Lifetime.Others;
  }
};

export const parseProject = async (projectPath: string): Promise<ProjectDI> => {
  // Validate projectPath
  if (!fsSync.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }
  const projectName = path.basename(projectPath);
  const registrations: Registration[] = [];
  const injectionSites: InjectionSite[] = [];
  const cycles: string[] = [];
  let dependencyGraph: Record<string, string[]> = {};
  const errorDetails: string[] = [];
  let parseStatus: 'success' | 'partial' | 'failed' = 'partial';

  try {
    // Primary: Roslyn tool
    const config = workspace.getConfiguration('diNavigator');
    let toolPath = config.get<string>('toolPath');
    if (!toolPath || !fsSync.existsSync(toolPath)) {
      toolPath = path.join(__dirname, 'tools', 'roslyn-di-analyzer', 'roslyn-di-analyzer.dll');
      if (!fsSync.existsSync(toolPath)) {
        // Fallback to local build path for development
        const fallbackPath = path.join('.', 'tools', 'roslyn-di-analyzer', 'bin', 'Debug', 'net9.0', 'roslyn-di-analyzer.dll');
        if (fsSync.existsSync(fallbackPath)) {
          toolPath = fallbackPath;
        } else {
          throw new Error('Roslyn tool not built or not bundled. Please configure diNavigator.toolPath in settings.');
        }
      }
    }

    const command = `dotnet "${toolPath}" --project "${projectPath}"`;
    const output = await new Promise<string>((resolve, reject) => {
      exec(command, { encoding: 'utf8', cwd: path.dirname(projectPath) }, (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        if (stderr) {
          console.warn(`Roslyn stderr: ${stderr}`);
        }
        resolve(stdout);
      });
    });
    let analysisResult;
    try {
      analysisResult = JSON.parse(output);
      // Basic validation
      if (!analysisResult.Registrations || !Array.isArray(analysisResult.Registrations)) {
        throw new Error('Invalid Roslyn output: missing or invalid Registrations');
      }
    } catch (jsonError) {
      throw new Error(`Failed to parse Roslyn JSON: ${jsonError}`);
    }

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
    parseStatus = 'success';
  } catch (error) {
    const err = error as Error;
    const errorMsg = `Primary parsing failed: ${err.message}`;
    console.error(errorMsg);
    window.showWarningMessage(errorMsg);
    errorDetails.push(errorMsg);
    parseStatus = 'partial';
    // Fallback to regex scanning
    try {
      const projectUri = Uri.file(projectPath);
      const config = workspace.getConfiguration('diNavigator');
      const excludePatterns = config.get<string[]>(CONFIG_EXCLUDE_FOLDERS) || DEFAULT_EXCLUDE_FOLDERS;
      const excludeGlob = excludePatterns.length > 1 ? `{${excludePatterns.join(',')}}` : excludePatterns[0];
      const csFiles = await workspace.findFiles(new RelativePattern(projectUri, '**/*.cs'), excludeGlob);
      const filePaths = csFiles.map(uri => uri.fsPath);
      console.log(`Fallback scanning ${filePaths.length} .cs files in ${projectName}, excluding: ${excludePatterns.join(', ')}`);

      const processFile = async (filePath: string): Promise<void> => {
        const source = await fs.readFile(filePath, 'utf8');
        // Registration regex for builder.Services or services (enhanced for factories)
        const regRegex = /(builder\.Services|services)\.(Add\w+)(?:\s*\([^)]*\))?(?:<([^>]+)>)?(?:,\s*([^>]+))?(?:\s*\([^)]*\))?/g;
        let regMatch;
        while ((regMatch = regRegex.exec(source)) !== null) {
          const [, , methodName, serviceType, implType] = regMatch;
          const fullMethod = regMatch[0];
          const lifetime = getLifetimeFromString(methodName.replace('Add', ''));
          const lineNumber = source.substring(0, regMatch.index).split('\n').length;
          // Handle factory/lambda if no implType (e.g., AddScoped(s => new ...))
          const implTypeFinal = implType ? implType.trim() : (fullMethod.includes('=>') ? 'Factory' : serviceType.trim());
          registrations.push({
            id: `reg-${path.basename(filePath)}-${lineNumber}`,
            lifetime,
            serviceType: serviceType ? serviceType.trim() : 'Unknown',
            implementationType: implTypeFinal,
            filePath,
            lineNumber,
            methodCall: fullMethod
          });
        }
        // Constructor injection regex (existing)
        const ctorRegex = /public\s+([A-Za-z_]\w*)\s*\(\s*([^)]*)\s*\)/g;
        let ctorMatch;
        while ((ctorMatch = ctorRegex.exec(source)) !== null) {
          const className = ctorMatch[1]?.trim() ?? 'UnknownClass';
          const paramsStr = ctorMatch[2] || '';
          const paramMatches = paramsStr.match(/([^\s,]+(?:<[^>]+>)?\??)\s+[\w]+/g) || [];
          const lineNumber = source.substring(0, ctorMatch.index).split('\n').length;
          for (const paramMatch of paramMatches) {
            if (paramMatch) {
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

        // Field injection regex (updated for generics and nullable)
        const fieldRegex = /private\s+(?:readonly\s+)?([^\s;]+(?:<[^>]+>)?\??)\s+[_a-zA-Z]\w*\s*;/g;
        let fieldMatch;
        while ((fieldMatch = fieldRegex.exec(source)) !== null) {
          const serviceType = (fieldMatch[1]?.trim()) ?? 'UnknownType';
          const lineNumber = source.substring(0, fieldMatch.index).split('\n').length;
          // Extract className from context (simplified: assume nearest class)
          const classMatch = source.substring(0, fieldMatch.index).match(/class\s+([^\s{]+)/);
          const className = (classMatch ? classMatch[1]?.trim() : 'UnknownClass') ?? 'UnknownClass';
          injectionSites.push({
            filePath,
            lineNumber,
            className,
            memberName: 'field',
            type: 'field',
            serviceType,
            linkedRegistrationIds: []
          });
        }
      };

      await Promise.all(filePaths.map(processFile));
      console.log(`Fallback parsed ${registrations.length} registrations, ${injectionSites.length} sites for ${projectName}`);
      parseStatus = 'partial'; // Fallback is partial by nature
    } catch (fallbackError) {
      const fbErr = fallbackError as Error;
      const fallbackMsg = `Fallback parsing failed: ${fbErr.message}`;
      console.error(fallbackMsg);
      window.showWarningMessage(fallbackMsg);
      errorDetails.push(fallbackMsg);
      parseStatus = 'failed';
    }

    // Basic fallback dependency graph from injection sites
    if (Object.keys(dependencyGraph).length === 0) {
      dependencyGraph = {};
      for (const site of injectionSites) {
        if (!dependencyGraph[site.className]) {
          dependencyGraph[site.className] = [];
        }
        if (!dependencyGraph[site.className].includes(site.serviceType)) {
          dependencyGraph[site.className].push(site.serviceType);
        }
      }
    }

    // Simple cycle detection using DFS on graph
    const hasCycle = (graph: Record<string, string[]>, node: string, visited: Set<string>, recStack: Set<string>): boolean => {
      if (recStack.has(node)) { return true; }
      if (visited.has(node)) { return false; }
      visited.add(node);
      recStack.add(node);
      for (const neighbor of graph[node] || []) {
        if (hasCycle(graph, neighbor, visited, recStack)) { return true; }
      }
      recStack.delete(node);
      return false;
    };

    const visited = new Set<string>();
    const recStack = new Set<string>();
    for (const node in dependencyGraph) {
      if (hasCycle(dependencyGraph, node, visited, recStack)) {
        cycles.push(`Cycle detected involving ${node} and its dependencies`);
      }
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
      site.linkedRegistrationIds = service.registrations.map(r => r.id);
      service.injectionSites.push(site);
    }
  }

  // Detect conflicts for each service
  for (const service of servicesByType.values()) {
    const lifetimes = new Set(service.registrations.map(r => r.lifetime));
    if (lifetimes.size > 1) {
      service.hasConflicts = true;
      service.conflicts = service.conflicts || [];
      service.conflicts.push({
        type: 'MixedLifetimes',
        details: `Multiple lifetimes: ${Array.from(lifetimes).join(', ')}`
      });
    }
    if (service.injectionSites.length > 0 && service.registrations.length === 0) {
      service.hasConflicts = true;
      service.conflicts = service.conflicts || [];
      service.conflicts.push({
        type: 'UnregisteredInjection',
        details: `${service.injectionSites.length} injection sites but no registration`
      });
    }
    if (service.registrations.length > 1 && new Set(service.registrations.map(r => r.implementationType)).size > 1) {
      service.hasConflicts = true;
      service.conflicts = service.conflicts || [];
      service.conflicts.push({
        type: 'MultipleImplementations',
        details: `${service.registrations.length} different implementations`
      });
    }
  }

  // Group by lifetime
  const serviceGroups: ServiceGroup[] = [];
  for (const lifetime of LIFETIMES) {
    const lifetimeServices = Array.from(servicesByType.values())
      .filter(s => s.registrations.some(r => r.lifetime === lifetime));
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
    dependencyGraph,
    parseStatus,
    errorDetails: errorDetails.length > 0 ? errorDetails : undefined
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