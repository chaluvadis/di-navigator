export const enum Lifetime {
    Singleton = 'Singleton',
    Scoped = 'Scoped',
    Transient = 'Transient',
    Others = 'Others'
}

export interface Registration {
    id: string;
    lifetime: Lifetime;
    serviceType: string; // e.g., 'IUserService'
    implementationType: string; // e.g., 'UserService'
    filePath: string;
    lineNumber: number;
    methodCall: string; // e.g., 'AddScoped'
}

export interface Service {
    name: string; // Full type name or interface
    registrations: Registration[];
    hasConflicts: boolean; // e.g., multiple impls for same interface
    conflicts?: Conflict[]; // List of detected conflicts
    injectionSites: InjectionSite[];
}

export interface ServiceGroup {
    lifetime: Lifetime | string; // Allow custom lifetimes like 'Others'
    services: Service[];
    color: string; // For TreeView theming, e.g., '#FF0000' for Singleton
    count?: number;
}

export interface ProjectDI {
    projectPath: string;
    projectName: string;
    serviceGroups: ServiceGroup[];
    cycles: string[];
    dependencyGraph: Record<string, string[]>;
    parseStatus: 'success' | 'partial' | 'failed';
    errorDetails?: string[];
    // Enhanced features from new Roslyn tool
    lifetimeConflicts?: ServiceLifetimeConflict[];
    serviceDependencyIssues?: ServiceDependencyIssue[];
    customRegistries?: CustomRegistry[];
    startupConfigurations?: StartupConfiguration[];
    metadata?: ProjectMetadata;
    analysisSummary?: AnalysisSummary;
}

export interface InjectionSite {
    filePath: string;
    lineNumber: number;
    className: string;
    memberName: string; // e.g., constructor or method name
    type: 'constructor' | 'method' | 'field';
    serviceType: string; // The injected service type
    linkedRegistrationIds: string[];
}

export interface Conflict {
    type: string; // 'Duplicate', 'MissingImpl', etc.
    details: string;
}

// Enhanced types from the new Roslyn tool
export interface ServiceLifetimeConflict {
    serviceType: string;
    implementationType: string;
    currentLifetime: string;
    recommendedLifetime: string;
    conflictReason: string;
    filePath: string;
    lineNumber: number;
    severity: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface ServiceDependencyIssue {
    serviceType: string;
    dependencyType: string;
    issueDescription: string;
    filePath: string;
    lineNumber: number;
    severity: 'Info' | 'Warning' | 'Error';
}

export interface CustomRegistry {
    registryName: string;
    registryType: string;
    filePath: string;
    lineNumber: number;
    registeredServices: string[];
}

export interface StartupConfiguration {
    configurationMethod: string;
    filePath: string;
    lineNumber: number;
    serviceRegistrations: any[];
}

export interface ProjectMetadata {
    targetFramework: string;
    packageReferences: string[];
    outputType: string;
    projectReferences: string[];
}

export interface AnalysisSummary {
    totalProjects: number;
    totalServiceRegistrations: number;
    totalCustomRegistries: number;
    totalStartupConfigurations: number;
    serviceLifetimes: Record<string, number>;
    projectTypes: Record<string, number>;
}

export interface WorkspaceAnalysis {
    projects: ProjectDI[];
    totalServices: number;
    totalProjects: number;
    analysisTimestamp: Date;
}

export interface ValidationResult {
    isValid: boolean;
    issues: ValidationIssue[];
    summary: {
        totalIssues: number;
        errorCount: number;
        warningCount: number;
        infoCount: number;
    };
}

export interface ValidationIssue {
    type: 'Structure' | 'Consistency' | 'Logic';
    severity: 'Info' | 'Warning' | 'Error';
    message: string;
    field: string;
}