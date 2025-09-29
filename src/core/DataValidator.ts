import {
    ProjectDI, ServiceGroup,
    Service, WorkspaceAnalysis,
    ValidationIssue, ValidationResult
} from './models';

export class DataValidator {
    constructor() { }
    validateWorkspaceAnalysis(data: WorkspaceAnalysis): ValidationResult {
        const issues: ValidationIssue[] = [];
        if (!data.projects || !Array.isArray(data.projects)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: 'Invalid projects array in analysis data',
                field: 'projects'
            });
        } else {
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
        return result;
    }

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
            project.serviceGroups.forEach((group) => {
                const groupIssues = this.validateServiceGroup(group, project.projectName);
                issues.push(...groupIssues);
            });
        }
        if (project.lifetimeConflicts) {
            const conflictIssues = this.validateLifetimeConflicts(project.lifetimeConflicts, project.projectName);
            issues.push(...conflictIssues);
        }
        return issues;
    }

    private validateServiceGroup(group: ServiceGroup, projectName: string): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        if (!group.lifetime) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Group: Missing lifetime`,
                field: 'lifetime'
            });
        }

        if (!group.services || !Array.isArray(group.services)) {
            issues.push({
                type: 'Structure',
                severity: 'Error',
                message: `${projectName} Group: Invalid services array`,
                field: 'services'
            });
        } else {
            // Validate service count matches actual services
            if (group.count !== undefined && group.count !== group.services.length) {
                issues.push({
                    type: 'Consistency',
                    severity: 'Warning',
                    message: `${projectName} Group: Service count mismatch`,
                    field: 'count'
                });
            }

            // Validate each service
            group.services.forEach((service, serviceIndex) => {
                const serviceIssues = this.validateService(service, projectName, serviceIndex);
                issues.push(...serviceIssues);
            });
        }
        return issues;
    }
    private validateService(service: Service, projectName: string, serviceIndex: number): ValidationIssue[] {
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