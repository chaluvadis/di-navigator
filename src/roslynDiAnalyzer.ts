import * as path from 'path';
import { ProjectDI } from './models';
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
            const projectDI = this.roslynToolService.convertToProjectDI(analysisResult, projectPath);

            return projectDI;

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

    public dispose(): void {
        this.useExternalTools = true;
    }
}