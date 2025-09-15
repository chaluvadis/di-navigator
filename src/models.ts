export enum Lifetime {
    Singleton = 'Singleton',
    Scoped = 'Scoped',
    Transient = 'Transient'
}

export interface Registration {
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
    lifetime: Lifetime;
    services: Service[];
    color: string; // For TreeView theming, e.g., '#FF0000' for Singleton
}

export interface InjectionSite {
    filePath: string;
    lineNumber: number;
    className: string;
    memberName: string; // e.g., constructor or method name
    type: 'constructor' | 'method' | 'field';
    serviceType: string; // The injected service type
}

export interface Conflict {
    type: string; // 'Duplicate', 'MissingImpl', etc.
    details: string;
}