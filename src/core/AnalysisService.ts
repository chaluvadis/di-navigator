import { RoslynToolService } from './roslynToolService';
import { ProjectDI } from './models';
export class AnalysisService {
    private roslynToolService: RoslynToolService | null = null;
    private isAnalysisInProgress = false;
    constructor() { }
    initialize(_workspaceRoot: string): void {
        this.roslynToolService = new RoslynToolService();
    }
    async analyzeSolution(projectPath: string): Promise<ProjectDI[]> {
        if (this.isAnalysisInProgress) {
            throw new Error('Analysis is already in progress');
        }
        if (!this.roslynToolService) {
            throw new Error('AnalysisService not initialized');
        }
        this.isAnalysisInProgress = true;
        try {
            const analysisResult = await this.roslynToolService.analyzeSolution(projectPath);
            return this.roslynToolService.convertToMultipleProjectDIs(analysisResult, projectPath);
        } catch (error) {
            throw error;
        } finally {
            this.isAnalysisInProgress = false;
        }
    }
    dispose(): void {
        this.roslynToolService = null;
        this.isAnalysisInProgress = false;
    }
}
