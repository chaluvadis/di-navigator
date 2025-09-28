import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ProjectDI, ServiceGroup, Service, Lifetime } from './models';

const execAsync = promisify(exec);
export class RoslynToolService {
    private readonly roslynToolPath: string;

    constructor() {
        // Try Release build first, then Debug build
        const releasePath = path.join(__dirname, '..', 'roslyn-tool', 'bin', 'Release', 'net9.0', 'DIServiceAnalyzer.dll');
        const debugPath = path.join(__dirname, '..', 'roslyn-tool', 'bin', 'Debug', 'net9.0', 'DIServiceAnalyzer.dll');

        if (fs.existsSync(releasePath)) {
            this.roslynToolPath = releasePath;
        } else if (fs.existsSync(debugPath)) {
            this.roslynToolPath = debugPath;
        } else {
            throw new Error(`Roslyn tool not found. Looked for: ${releasePath} and ${debugPath}. Please build the roslyn-tool project.`);
        }
    }
    async analyzeSolution(solutionPath: string): Promise<any> {
        try {
            if (!fs.existsSync(solutionPath)) {
                throw new Error(`Solution file not found: ${solutionPath}`);
            }

            if (!fs.existsSync(this.roslynToolPath)) {
                throw new Error(`Roslyn tool not found at: ${this.roslynToolPath}. Please build the roslyn-tool project.`);
            }

            const command = `dotnet "${this.roslynToolPath}" --input "${solutionPath}"`;
            const { stdout, stderr } = await execAsync(command, {
                cwd: path.dirname(solutionPath),
                maxBuffer: 1024 * 1024 * 10
            });

            if (stderr) {
                console.warn(`RoslynToolService stderr: ${stderr}`);
            }

            // Extract JSON from stdout - the tool outputs progress info mixed with JSON
            const jsonMatch = stdout.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error(`No valid JSON found in Roslyn tool output. Raw output: ${stdout}`);
            }

            try {
                return JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                throw new Error(`Failed to parse extracted JSON: ${parseError}. Extracted JSON: ${jsonMatch[0]}`);
            }
        } catch (error) {
            console.error(`RoslynToolService analysis failed: ${error}`);
            throw new Error(`Roslyn tool analysis failed: ${error}`);
        }
    }

    convertToProjectDI(analysisResult: any, projectPath: string): ProjectDI {
        try {
            const serviceGroups: ServiceGroup[] = [];
            const lifetimeMap = new Map<string, Service[]>();

            for (const project of analysisResult.Projects || []) {
                for (const registration of project.ServiceRegistrations || []) {
                    const lifetime = this.mapLifetime(registration.Lifetime);
                    const groupKey = lifetime;

                    if (!lifetimeMap.has(groupKey)) {
                        lifetimeMap.set(groupKey, []);
                    }

                    const service = this.createServiceFromRegistration(registration, project);
                    lifetimeMap.get(groupKey)!.push(service);
                }
            }

            // Sort service groups by lifetime priority
            const lifetimeOrder = { 'Scoped': 0, 'Singleton': 1, 'Transient': 2, 'Others': 3 };
            const sortedEntries = Array.from(lifetimeMap.entries()).sort((a, b) => {
                const orderA = lifetimeOrder[a[0] as keyof typeof lifetimeOrder] ?? 999;
                const orderB = lifetimeOrder[b[0] as keyof typeof lifetimeOrder] ?? 999;
                return orderA - orderB;
            });

            for (const [lifetime, services] of sortedEntries) {
                // Sort services within each group alphabetically
                const sortedServices = services.sort((a: Service, b: Service) => a.name.localeCompare(b.name));

                serviceGroups.push({
                    lifetime: lifetime as Lifetime,
                    services: sortedServices,
                    color: this.getLifetimeColor(lifetime as Lifetime),
                    count: services.length
                });
            }

            return {
                projectPath,
                projectName: path.basename(projectPath, path.extname(projectPath)),
                serviceGroups,
                cycles: [],
                dependencyGraph: {},
                parseStatus: serviceGroups.length > 0 ? 'success' : 'partial',
                errorDetails: serviceGroups.length === 0 ? ['No services found in analysis'] : undefined,
                // Enhanced features from new Roslyn tool
                lifetimeConflicts: this.mapLifetimeConflicts(analysisResult.LifetimeConflicts || []),
                serviceDependencyIssues: this.mapServiceDependencyIssues(analysisResult.ServiceDependencyIssues || []),
                customRegistries: this.mapCustomRegistries(analysisResult.CustomRegistries || []),
                startupConfigurations: this.mapStartupConfigurations(analysisResult.StartupConfigurations || []),
                metadata: this.mapProjectMetadata(analysisResult.Metadata || {}),
                analysisSummary: this.mapAnalysisSummary(analysisResult.Summary || {})
            };

        } catch (error) {
            console.error(`RoslynToolService conversion failed: ${error}`);
            return {
                projectPath,
                projectName: path.basename(projectPath, path.extname(projectPath)),
                serviceGroups: [],
                cycles: [],
                dependencyGraph: {},
                parseStatus: 'failed',
                errorDetails: [`Conversion failed: ${error}`]
            };
        }
    }

    private mapLifetime(lifetime: any): Lifetime {
        // Convert to string and handle null/undefined values
        const lifetimeStr = lifetime?.toString()?.toLowerCase() || '';

        switch (lifetimeStr) {
            case 'singleton':
                return Lifetime.Singleton;
            case 'scoped':
                return Lifetime.Scoped;
            case 'transient':
                return Lifetime.Transient;
            default:
                return Lifetime.Others;
        }
    }
    private getLifetimeColor(lifetime: Lifetime): string {
        switch (lifetime) {
            case Lifetime.Singleton:
                return '#FF5722';
            case Lifetime.Scoped:
                return '#2196F3';
            case Lifetime.Transient:
                return '#4CAF50';
            case Lifetime.Others:
                return '#9E9E9E';
            default:
                return '#2A2A2A';
        }
    }

    private createServiceFromRegistration(registration: any, _project: any): Service {
        const serviceType = registration.ServiceType || 'Unknown';
        const implementationType = registration.ImplementationType || serviceType;

        // Map injection sites if available
        const injectionSites = this.mapInjectionSites(registration.InjectionSites || []);

        return {
            name: serviceType,
            registrations: [{
                id: `${registration.FilePath}:${registration.LineNumber}`,
                lifetime: this.mapLifetime(registration.Lifetime),
                serviceType,
                implementationType,
                filePath: registration.FilePath,
                lineNumber: registration.LineNumber,
                methodCall: registration.RegistrationMethod
            }],
            hasConflicts: false,
            injectionSites
        };
    }

    private mapInjectionSites(injectionSites: any[]): any[] {
        return injectionSites.map(site => ({
            filePath: site.FilePath || '',
            lineNumber: site.LineNumber || 0,
            className: site.ClassName || '',
            memberName: site.MemberName || '',
            type: site.Type || 'constructor',
            serviceType: site.ServiceType || '',
            linkedRegistrationIds: site.LinkedRegistrationIds || []
        }));
    }

    private mapLifetimeConflicts(conflicts: any[]): any[] {
        return conflicts.map(conflict => ({
            serviceType: conflict.ServiceType || '',
            implementationType: conflict.ImplementationType || '',
            currentLifetime: conflict.CurrentLifetime || '',
            recommendedLifetime: conflict.RecommendedLifetime || '',
            conflictReason: conflict.ConflictReason || '',
            filePath: conflict.FilePath || '',
            lineNumber: conflict.LineNumber || 0,
            severity: conflict.Severity || 'Low'
        }));
    }

    private mapServiceDependencyIssues(issues: any[]): any[] {
        return issues.map(issue => ({
            serviceType: issue.ServiceType || '',
            dependencyType: issue.DependencyType || '',
            issueDescription: issue.IssueDescription || '',
            filePath: issue.FilePath || '',
            lineNumber: issue.LineNumber || 0,
            severity: issue.Severity || 'Info'
        }));
    }

    private mapCustomRegistries(registries: any[]): any[] {
        return registries.map(registry => ({
            registryName: registry.RegistryName || '',
            registryType: registry.RegistryType || '',
            filePath: registry.FilePath || '',
            lineNumber: registry.LineNumber || 0,
            registeredServices: registry.RegisteredServices || []
        }));
    }

    private mapStartupConfigurations(configurations: any[]): any[] {
        return configurations.map(config => ({
            configurationMethod: config.ConfigurationMethod || '',
            filePath: config.FilePath || '',
            lineNumber: config.LineNumber || 0,
            serviceRegistrations: config.ServiceRegistrations || []
        }));
    }

    private mapProjectMetadata(metadata: any): any {
        return {
            targetFramework: metadata.TargetFramework || '',
            packageReferences: metadata.PackageReferences || [],
            outputType: metadata.OutputType || '',
            projectReferences: metadata.ProjectReferences || []
        };
    }

    private mapAnalysisSummary(summary: any): any {
        return {
            totalProjects: summary.TotalProjects || 0,
            totalServiceRegistrations: summary.TotalServiceRegistrations || 0,
            totalCustomRegistries: summary.TotalCustomRegistries || 0,
            totalStartupConfigurations: summary.TotalStartupConfigurations || 0,
            serviceLifetimes: summary.ServiceLifetimes || {},
            projectTypes: summary.ProjectTypes || {}
        };
    }
}