import * as path from 'path';
import { ProjectDI, ServiceGroup, Service, Lifetime } from './models';
import { RoslynToolService } from './roslynToolService';
export class RoslynDiAnalyzer {
    private useExternalTools: boolean = true;
    private roslynToolService: RoslynToolService;

    constructor(_workspaceRoot: string) {
        this.roslynToolService = new RoslynToolService();
    }

    public setUseExternalTools(useExternal: boolean): void {
        this.useExternalTools = useExternal;
    }
    async analyzeProject(projectPath: string): Promise<ProjectDI> {
        try {
            if (!this.useExternalTools) {
                console.warn('RoslynDiAnalyzer: External tools disabled, analysis will be limited');
                return {
                    projectPath,
                    projectName: path.basename(projectPath),
                    serviceGroups: [],
                    cycles: [],
                    dependencyGraph: {},
                    parseStatus: 'failed' as const,
                    errorDetails: ['External tools disabled']
                };
            }

            const analysisResult = await this.roslynToolService.analyzeSolution(projectPath);

            // Use the new multiple project conversion method
            const projectDIs = this.roslynToolService.convertToMultipleProjectDIs(analysisResult, projectPath);

            // NEW: Enable proper multi-project support instead of combining
            if (projectDIs.length > 1) {
                // For now, return the first project as the "main" project
                // In the future, we could return all projects or let user choose
                console.log(`RoslynDiAnalyzer: Found ${projectDIs.length} projects, using first project for analysis`);
                return projectDIs[0];
            } else if (projectDIs.length === 1) {
                return projectDIs[0];
            } else {
                // No projects found
                return {
                    projectPath,
                    projectName: path.basename(projectPath),
                    serviceGroups: [],
                    cycles: [],
                    dependencyGraph: {},
                    parseStatus: 'failed' as const,
                    errorDetails: ['No projects found in analysis']
                };
            }

        } catch (error) {
            console.error(`RoslynDiAnalyzer: Analysis failed: ${error}`);
            return {
                projectPath,
                projectName: path.basename(projectPath),
                serviceGroups: [],
                cycles: [],
                dependencyGraph: {},
                parseStatus: 'failed' as const,
                errorDetails: [`Analysis failed: ${error}`]
            };
        }
    }

    /**
     * Filter out projects that should not be included in the analysis
     * @param projects Array of projects to filter
     * @returns Filtered array of projects
     */
    private filterProjects(projects: any[]): any[] {
        return projects.filter(project => {
            const projectName = project.ProjectName?.toLowerCase() || '';

            // Exclude test projects
            if (projectName.includes('test') || projectName.endsWith('.tests')) {
                return false;
            }

            // Exclude build/bootstrap projects
            if (projectName.includes('build') || projectName.includes('bootstrap')) {
                return false;
            }

            // Exclude specific problematic projects
            if (projectName.includes('buildyoureventstore')) {
                return false;
            }

            // Exclude projects with no service registrations
            if (!project.ServiceRegistrations || project.ServiceRegistrations.length === 0) {
                return false;
            }

            return true;
        });
    }

    /**
     * Combine multiple projects into a single ProjectDI for backward compatibility
     * This is a temporary solution until we fully implement multi-project support
     */
    private combineMultipleProjects(analysisResult: any, projectPath: string): ProjectDI {
        const allServiceGroups: ServiceGroup[] = [];
        const lifetimeMap = new Map<string, Service[]>();

        // Filter projects before processing
        const filteredProjects = this.filterProjects(analysisResult.Projects || []);

        if (filteredProjects.length === 0) {
            // No valid projects after filtering
            return {
                projectPath,
                projectName: path.basename(projectPath),
                serviceGroups: [],
                cycles: [],
                dependencyGraph: {},
                parseStatus: 'failed' as const,
                errorDetails: ['No valid projects found after filtering']
            };
        }

        // Process filtered projects
        for (const project of filteredProjects) {
            for (const registration of project.ServiceRegistrations || []) {
                const lifetime = this.roslynToolService.mapLifetime(registration.Lifetime);
                const groupKey = lifetime;

                if (!lifetimeMap.has(groupKey)) {
                    lifetimeMap.set(groupKey, []);
                }

                const service = this.roslynToolService.createServiceFromRegistration(registration, project);
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

            allServiceGroups.push({
                lifetime: lifetime as Lifetime,
                services: sortedServices,
                color: this.getLifetimeColor(lifetime as Lifetime),
                count: services.length
            });
        }

        return {
            projectPath,
            projectName: analysisResult.SolutionName || path.basename(projectPath, path.extname(projectPath)),
            serviceGroups: allServiceGroups,
            cycles: [],
            dependencyGraph: {},
            parseStatus: allServiceGroups.length > 0 ? 'success' : 'partial',
            errorDetails: allServiceGroups.length === 0 ? ['No services found in analysis'] : undefined,
            // Enhanced features from new Roslyn tool
            lifetimeConflicts: this.mapLifetimeConflicts(analysisResult.LifetimeConflicts || []),
            serviceDependencyIssues: this.mapServiceDependencyIssues(analysisResult.ServiceDependencyIssues || []),
            customRegistries: this.mapCustomRegistries(analysisResult.CustomRegistries || []),
            startupConfigurations: this.mapStartupConfigurations(analysisResult.StartupConfigurations || []),
            metadata: this.mapProjectMetadata(analysisResult.Metadata || {}),
            analysisSummary: this.mapAnalysisSummary(analysisResult.Summary || {})
        };
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

    public dispose(): void {
        this.useExternalTools = true;
    }
}