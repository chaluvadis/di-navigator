import * as vscode from 'vscode';
import { Logger } from './Logger';

export class ErrorHandler {
    constructor(private logger: Logger) { }

    handleError(error: unknown, _operation: string): void {
        const errorInfo = this.analyzeError(error, _operation);

        // Log the error with context
        this.logger.error(
            `Operation '${_operation}' failed: ${errorInfo.message}`,
            'ErrorHandler',
            {
                error: errorInfo.originalError,
                category: errorInfo.category,
                severity: errorInfo.severity,
                suggestedActions: errorInfo.suggestedActions
            }
        );

        // Show user notification with actionable message
        this.showUserNotification(errorInfo);
    }

    private analyzeError(error: unknown, _operation: string): ErrorAnalysis {
        // Extract error message
        let message: string;
        let originalError: any = error;

        if (error instanceof Error) {
            message = error.message;
        } else if (typeof error === 'string') {
            message = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
            message = String((error as any).message);
        } else {
            message = String(error);
        }

        // Analyze error and provide solutions
        if (message.includes('Roslyn tool not found')) {
            return {
                message,
                category: 'ToolNotFound',
                severity: 'High',
                suggestedActions: [
                    'Build the roslyn-tool project: cd roslyn-tool && dotnet build',
                    'Check if .NET SDK is installed',
                    'Verify the tool is in the correct location'
                ],
                originalError: error
            };
        }

        if (message.includes('Solution file not found') || message.includes('Project file not found')) {
            return {
                message,
                category: 'FileNotFound',
                severity: 'High',
                suggestedActions: [
                    'Verify the file path is correct',
                    'Check if the file exists in the workspace',
                    'Ensure the workspace contains a valid .NET project'
                ],
                originalError: error
            };
        }

        if (message.includes('Analysis cancelled')) {
            return {
                message: 'Analysis was cancelled by user',
                category: 'UserCancelled',
                severity: 'Info',
                suggestedActions: [
                    'No action needed - analysis was cancelled'
                ],
                originalError: error
            };
        }

        if (message.includes('Permission denied') || message.includes('Access denied')) {
            return {
                message,
                category: 'Permission',
                severity: 'High',
                suggestedActions: [
                    'Check file permissions',
                    'Run VSCode with appropriate privileges',
                    'Verify antivirus is not blocking the tool'
                ],
                originalError: error
            };
        }

        // Default analysis
        return {
            message,
            category: 'Unknown',
            severity: 'Medium',
            suggestedActions: [
                'Check the output panel for detailed logs',
                'Verify project structure and dependencies',
                'Try restarting the analysis'
            ],
            originalError: error
        };
    }

    private showUserNotification(errorInfo: ErrorAnalysis): void {
        let userMessage = `❌ ${errorInfo.category}: ${errorInfo.message}`;

        // Add suggested actions to the message
        if (errorInfo.suggestedActions.length > 0) {
            userMessage += `\n\n💡 Suggested solutions:\n${errorInfo.suggestedActions.map(action => `• ${action}`).join('\n')}`;
        }

        // Show appropriate notification type based on severity
        switch (errorInfo.severity) {
            case 'Info':
                vscode.window.showInformationMessage(userMessage);
                break;
            case 'High':
            case 'Medium':
            default:
                vscode.window.showErrorMessage(userMessage);
                break;
        }
    }
}

interface ErrorAnalysis {
    message: string;
    category: string;
    severity: 'Info' | 'Low' | 'Medium' | 'High' | 'Critical';
    suggestedActions: string[];
    originalError: unknown;
}