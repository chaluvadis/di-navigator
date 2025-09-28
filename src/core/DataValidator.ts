import { ProjectDI, ServiceGroup, Service, WorkspaceAnalysis } from '../models';
import { Logger } from './Logger';

export class DataValidator {
    constructor(private logger: Logger) {}

    /**
     * Validate complete workspace analysis data
     */
    validateWorkspaceAnalysis(data: WorkspaceAnalysis): ValidationResult {
        const issues: ValidationIssue[] = [];

        this.logger.debug('Validating workspace analysis data', 'DataValidator', {
            projectsCount: data.projects?.length || 0,
            totalServices: data.totalServices,
            totalProjects: data.totalProjects
        });

        // Validate basic structure
        if (!data.projects || !Array.isArray(data.projects)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: 'Invalid projects array in analysis data',
                field: 'projects'
            });
        } else {
            // Validate each project
            data.projects.forEach((project, index) => {
                const projectIssues = this.validateProject(project, index);
                issues.push(...projectIssues);
            });
        }

        // Validate totals
        const actualServiceCount = data.projects?.reduce((acc, project) =>
            acc + project.serviceGroups.reduce((acc2, group) => acc2 + group.services.length, 0), 0) || 0;

        if (actualServiceCount !== data.totalServices) {
            issues.push({
                type: 'Consistency',
                severity: 'Warning',
                message: `Service count mismatch: expected ${data.totalServices}, found ${actualServiceCount}`,
                field: 'totalServices'
            });
        }

        const actualProjectCount = data.projects?.length || 0;
        if (actualProjectCount !== data.totalProjects) {
            issues.push({
                type: 'Consistency',
                severity: 'Warning',
                message: `Project count mismatch: expected ${data.totalProjects}, found ${actualProjectCount}`,
                field: 'totalProjects'
            });
        }

        const result: ValidationResult = {
            isValid: issues.filter(i => i.severity === 'Error').length === 0,
            issues,
            summary: {
                totalIssues: issues.length,
                errorCount: issues.filter(i => i.severity === 'Error').length,
                warningCount: issues.filter(i => i.severity === 'Warning').length,
                infoCount: issues.filter(i => i.severity === 'Info').length
            }
        };

        this.logger.debug('Data validation completed', 'DataValidator', {
            isValid: result.isValid,
            totalIssues: result.summary.totalIssues
        });

        return result;
    }

    /**
     * Validate single project data
     */
    private validateProject(project: ProjectDI, index: number): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        // Validate project structure
        if (!project.projectName) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `Project ${index + 1}: Missing project name`,
                field: 'projectName'
            });
        }

        if (!project.projectPath) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `Project ${index + 1}: Missing project path`,
                field: 'projectPath'
            });
        }

        // Validate service groups
        if (!project.serviceGroups || !Array.isArray(project.serviceGroups)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `Project ${project.projectName}: Invalid service groups`,
                field: 'serviceGroups'
            });
        } else {
            project.serviceGroups.forEach((group, groupIndex) => {
                const groupIssues = this.validateServiceGroup(group, project.projectName, groupIndex);
                issues.push(...groupIssues);
            });
        }

        // Validate enhanced features if present
        if (project.lifetimeConflicts) {
            const conflictIssues = this.validateLifetimeConflicts(project.lifetimeConflicts, project.projectName);
            issues.push(...conflictIssues);
        }

        return issues;
    }

    /**
     * Validate service group data
     */
    private validateServiceGroup(group: ServiceGroup, projectName: string, _groupIndex: number): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!group.lifetime) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Group ${_groupIndex + 1}: Missing lifetime`,
                field: 'lifetime'
            });
        }

        if (!group.services || !Array.isArray(group.services)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Group ${_groupIndex + 1}: Invalid services array`,
                field: 'services'
            });
        } else {
            // Validate service count matches actual services
            if (group.count !== undefined && group.count !== group.services.length) {
                issues.push({
                    type: 'Consistency',
                    severity: 'Warning',
                    message: `${projectName} Group ${_groupIndex + 1}: Service count mismatch`,
                    field: 'count'
                });
            }

            // Validate each service
            group.services.forEach((service, serviceIndex) => {
                const serviceIssues = this.validateService(service, projectName, _groupIndex, serviceIndex);
                issues.push(...serviceIssues);
            });
        }

        return issues;
    }

    /**
     * Validate service data
     */
    private validateService(service: Service, projectName: string, _groupIndex: number, serviceIndex: number): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (!service.name) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Service ${serviceIndex + 1}: Missing service name`,
                field: 'name'
            });
        }

        if (!service.registrations || !Array.isArray(service.registrations)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Service ${service.name}: Invalid registrations array`,
                field: 'registrations'
            });
        } else {
            // Validate each registration
            service.registrations.forEach((registration, regIndex) => {
                if (!registration.filePath) {
                    issues.push({
                        type: 'Structure',
                        severity: 'Warning',
                        message: `${projectName} Service ${service.name} Registration ${regIndex + 1}: Missing file path`,
                        field: 'filePath'
                    });
                }

                if (registration.lineNumber === undefined || registration.lineNumber < 1) {
                    issues.push({
                        type: 'Structure',
                        severity: 'Warning',
                        message: `${projectName} Service ${service.name} Registration ${regIndex + 1}: Invalid line number`,
                        field: 'lineNumber'
                    });
                }
            });
        }

        return issues;
    }

    /**
     * Validate lifetime conflicts data
     */
    private validateLifetimeConflicts(conflicts: any[], projectName: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        conflicts.forEach((conflict, index) => {
            if (!conflict.serviceType) {
                issues.push({
                    type: 'Structure',
                    severity: 'Warning',
                    message: `${projectName} Conflict ${index + 1}: Missing service type`,
                    field: 'serviceType'
                });
            }

            if (!conflict.conflictReason) {
                issues.push({
                    type: 'Structure',
                    severity: 'Info',
                    message: `${projectName} Conflict ${index + 1}: Missing conflict reason`,
                    field: 'conflictReason'
                });
            }
        });

        return issues;
    }
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