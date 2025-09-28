import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';
import { RoslynDiAnalyzer } from '../roslynDiAnalyzer';
import { ProjectDI } from '../models';

export class AnalysisService {
    private readonly logger: Logger;
    private readonly errorHandler: ErrorHandler;
    private diAnalyzer: RoslynDiAnalyzer | null = null;
    private currentAnalysisData: ProjectDI | null = null;
    private isAnalysisInProgress = false;

    constructor(logger: Logger, errorHandler: ErrorHandler) {
        this.logger = logger;
        this.errorHandler = errorHandler;
    }

    /**
     * Initialize the analysis service
     * @param workspaceRoot Workspace root path
     */
    initialize(workspaceRoot: string): void {
        this.logger.info('Initializing AnalysisService...', 'AnalysisService');

        this.diAnalyzer = new RoslynDiAnalyzer(workspaceRoot);

        // Configure analyzer based on settings
        const useExternalTools = vscode.workspace.getConfiguration('di-navigator').get('useExternalTools', true);
        this.diAnalyzer.setUseExternalTools(useExternalTools);

        this.logger.info('AnalysisService initialized', 'AnalysisService', {
            workspaceRoot,
            useExternalTools
        });
    }

    async analyzeProject(projectPath: string): Promise<ProjectDI> {
        if (this.isAnalysisInProgress) {
            throw new Error('Analysis is already in progress');
        }

        if (!this.diAnalyzer) {
            throw new Error('AnalysisService not initialized');
        }

        this.isAnalysisInProgress = true;
        this.logger.info('Starting project analysis...', 'AnalysisService', { projectPath });

        try {
            const analysisResult = await this.diAnalyzer.analyzeProject(projectPath);

            this.currentAnalysisData = analysisResult;
            this.logger.info('Project analysis completed', 'AnalysisService', {
                serviceCount: analysisResult.serviceGroups.reduce((acc, group) => acc + group.services.length, 0),
                groupCount: analysisResult.serviceGroups.length,
                projectName: analysisResult.projectName
            });

            return analysisResult;

        } catch (error) {
            this.logger.error('Project analysis failed', 'AnalysisService', { error, projectPath });
            throw error;
        } finally {
            this.isAnalysisInProgress = false;
        }
    }

    /**
     * Analyze solution and return multiple projects
     * This method provides access to all projects in a solution
     */
    async analyzeSolution(projectPath: string): Promise<ProjectDI[]> {
        if (this.isAnalysisInProgress) {
            throw new Error('Analysis is already in progress');
        }

        if (!this.diAnalyzer) {
            throw new Error('AnalysisService not initialized');
        }

        this.isAnalysisInProgress = true;
        this.logger.info('Starting solution analysis...', 'AnalysisService', { projectPath });

        try {
            // Get the raw analysis result from Roslyn tool
            const analysisResult = await (this.diAnalyzer as any).roslynToolService.analyzeSolution(projectPath);

            // Log what we found for debugging
            this.logger.debug('Solution analysis result', 'AnalysisService', {
                hasProjects: !!analysisResult.Projects,
                projectCount: analysisResult.Projects?.length || 0,
                solutionName: analysisResult.SolutionName
            });

            // Convert to multiple ProjectDIs without combining
            const projectDIs = (this.diAnalyzer as any).roslynToolService.convertToMultipleProjectDIs(analysisResult, projectPath);

            this.logger.info('Solution analysis completed', 'AnalysisService', {
                projectCount: projectDIs.length,
                totalServices: projectDIs.reduce((acc: number, project: ProjectDI) =>
                    acc + project.serviceGroups.reduce((acc2: number, group: any) => acc2 + group.services.length, 0), 0)
            });

            return projectDIs;

        } catch (error) {
            this.logger.error('Solution analysis failed', 'AnalysisService', { error, projectPath });
            throw error;
        } finally {
            this.isAnalysisInProgress = false;
        }
    }

    dispose(): void {
        this.logger.info('Disposing AnalysisService...');
        if (this.diAnalyzer) {
            this.diAnalyzer.dispose();
            this.diAnalyzer = null;
        }
        this.currentAnalysisData = null;
        this.isAnalysisInProgress = false;

        this.logger.info('AnalysisService disposed');
    }
}
