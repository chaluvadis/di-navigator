import * as vscode from 'vscode';
import { Logger } from './Logger';
import { ErrorHandler } from './ErrorHandler';
import { RoslynDiAnalyzer } from '../roslynDiAnalyzer';
import { ProjectDI } from '../models';

/**
 * Analysis Service
 *
 * Handles dependency injection analysis operations using the Roslyn tool.
 * Manages the analysis lifecycle, caching, and result processing.
 */
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

    /**
     * Analyze a .NET project for dependency injection configuration
     * @param projectPath Path to the project to analyze
     * @returns Analysis results
     */
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
                groupCount: analysisResult.serviceGroups.length
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
     * Dispose of the analysis service
     */
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
