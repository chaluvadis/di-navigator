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
                throw new Error(`Solution file not found: ${solutionPath}. Please ensure the file exists and is accessible.`);
            }

            console.debug(`RoslynToolService: Analyzing solution: ${solutionPath}`);

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
        // For backward compatibility, if multiple projects exist, combine them
        if (analysisResult.Projects && analysisResult.Projects.length > 1) {
            return this.combineMultipleProjects(analysisResult, projectPath);
        }

        // Single project logic (existing implementation)
        try {
            const serviceGroups: ServiceGroup[] = [];
            const lifetimeMap = new Map<string, Service[]>();

            // Handle both single project analysis and solution analysis
            const projects = analysisResult.Projects || [];

            // If no projects array, check if the analysisResult itself is a single project
            if (projects.length === 0 && analysisResult.ServiceRegistrations) {
                // Single project case - wrap in array for consistent processing
                projects.push(analysisResult);
            }

            for (const project of projects) {
                for (const registration of project.ServiceRegistrations || []) {
                    const originalLifetime = registration.Lifetime;
                    const lifetime = this.mapLifetime(registration.Lifetime);
                    const groupKey = lifetime;

                    console.debug(`Processing registration: ${registration.ServiceType} -> ${originalLifetime} -> ${lifetime}`);

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

                console.debug(`Creating service group: ${lifetime} with ${services.length} services`);

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

    public mapLifetime(lifetime: number | string | null | undefined): Lifetime {
        // Handle null/undefined values
        if (lifetime === null || lifetime === undefined) {
            console.warn(`Null/undefined lifetime value, defaulting to Others`);
            return Lifetime.Others;
        }

        // Handle numeric values (from Roslyn tool)
        if (typeof lifetime === 'number') {
            switch (lifetime) {
                case 0:
                    return Lifetime.Transient;
                case 1:
                    return Lifetime.Scoped;
                case 2:
                    return Lifetime.Singleton;
                default:
                    console.warn(`Unknown numeric lifetime value: ${lifetime}`);
                    return Lifetime.Others;
            }
        }

        // Handle string values (convert to string and trim)
        const lifetimeStr = lifetime.toString().trim();

        // Handle empty string values
        if (!lifetimeStr) {
            console.warn(`Empty lifetime value, defaulting to Others`);
            return Lifetime.Others;
        }

        // Check for both capitalized and lowercase values
        const lowerLifetime = lifetimeStr.toLowerCase();

        switch (lowerLifetime) {
            case 'singleton':
            case '2': // Also handle string "2"
                return Lifetime.Singleton;
            case 'scoped':
            case '1': // Also handle string "1"
                return Lifetime.Scoped;
            case 'transient':
            case '0': // Also handle string "0"
                return Lifetime.Transient;
            default:
                // Log unknown lifetime values for debugging
                console.warn(`Unknown lifetime value: "${lifetimeStr}" (type: ${typeof lifetime})`);
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

    public createServiceFromRegistration(registration: any, _project: any): Service {
        const serviceType = registration.ServiceType || 'Unknown';
        const implementationType = registration.ImplementationType || serviceType;

        // Map injection sites if available
        const injectionSites = this.mapInjectionSites(registration.InjectionSites || []);

        // Log the original lifetime value for debugging
        const originalLifetime = registration.Lifetime;
        const mappedLifetime = this.mapLifetime(originalLifetime);

        console.debug(`Lifetime mapping: ${originalLifetime} -> ${mappedLifetime}`);

        return {
            name: serviceType,
            registrations: [{
                id: `${registration.FilePath}:${registration.LineNumber}`,
                lifetime: mappedLifetime,
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
     * Convert analysis result to multiple ProjectDI objects (one per project)
     */
    public convertToMultipleProjectDIs(analysisResult: any, projectPath: string): ProjectDI[] {
        const projectDIs: ProjectDI[] = [];

        if (!analysisResult.Projects || analysisResult.Projects.length === 0) {
            // Single project case
            const singleProject = this.convertToProjectDI(analysisResult, projectPath);
            if (singleProject) {
                projectDIs.push(singleProject);
            }
            return projectDIs;
        }

        // Filter projects before processing
        const filteredProjects = this.filterProjects(analysisResult.Projects);

        if (filteredProjects.length === 0) {
            // No valid projects after filtering
            return projectDIs;
        }

        // Multiple projects case - create one ProjectDI per filtered project
        for (const project of filteredProjects) {
            const projectDI = this.convertSingleProjectToProjectDI(project, projectPath, analysisResult.SolutionName);
            if (projectDI) {
                projectDIs.push(projectDI);
            }
        }

        return projectDIs;
    }

    /**
     * Convert a single project from analysis result to ProjectDI
     */
    private convertSingleProjectToProjectDI(project: any, solutionPath: string, solutionName?: string): ProjectDI {
        try {
            const serviceGroups: ServiceGroup[] = [];
            const lifetimeMap = new Map<string, Service[]>();

            for (const registration of project.ServiceRegistrations || []) {
                const lifetime = this.mapLifetime(registration.Lifetime);
                const groupKey = lifetime;

                if (!lifetimeMap.has(groupKey)) {
                    lifetimeMap.set(groupKey, []);
                }

                const service = this.createServiceFromRegistration(registration, project);
                lifetimeMap.get(groupKey)!.push(service);
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
                projectPath: project.ProjectPath || solutionPath,
                projectName: project.ProjectName || solutionName || path.basename(project.ProjectPath || solutionPath, path.extname(project.ProjectPath || solutionPath)),
                serviceGroups,
                cycles: [],
                dependencyGraph: {},
                parseStatus: serviceGroups.length > 0 ? 'success' : 'partial',
                errorDetails: serviceGroups.length === 0 ? ['No services found in analysis'] : undefined,
                // Enhanced features from new Roslyn tool
                lifetimeConflicts: this.mapLifetimeConflicts(project.LifetimeConflicts || []),
                serviceDependencyIssues: this.mapServiceDependencyIssues(project.ServiceDependencyIssues || []),
                customRegistries: this.mapCustomRegistries(project.CustomRegistries || []),
                startupConfigurations: this.mapStartupConfigurations(project.StartupConfigurations || []),
                metadata: this.mapProjectMetadata(project.Metadata || {}),
                analysisSummary: this.mapAnalysisSummary(project.Summary || {})
            };

        } catch (error) {
            console.error(`RoslynToolService conversion failed for project ${project.ProjectName}: ${error}`);
            return {
                projectPath: project.ProjectPath || solutionPath,
                projectName: project.ProjectName || 'Unknown Project',
                serviceGroups: [],
                cycles: [],
                dependencyGraph: {},
                parseStatus: 'failed',
                errorDetails: [`Conversion failed: ${error}`]
            };
        }
    }

    /**
     * Combine multiple projects into a single ProjectDI for backward compatibility
     */
    private combineMultipleProjects(analysisResult: any, projectPath: string): ProjectDI {
        const allServiceGroups: ServiceGroup[] = [];
        const lifetimeMap = new Map<string, Service[]>();

        // Process all projects
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
}