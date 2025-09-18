import { QuickPickItem, Uri } from "vscode";

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
    name?: string; // For named services, e.g., key for named registration
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
    lifetime: Lifetime;
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

export const enum Colors {
    Singleton = '#FF5722',
    Scoped = '#2196F3',
    Transient = '#4CAF50',
    Default = '#9E9E9E',
    Others = '#808080'
}

export interface PickItem extends QuickPickItem {
    registration: Registration;
}

export interface ProjectItem extends QuickPickItem {
    uri: Uri;
}

export interface ConflictItem {
    type: string;
    details: string;
}

export interface TypeArgs {
    serviceType: string;
    implType: string;
}