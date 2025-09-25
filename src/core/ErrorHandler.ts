import * as vscode from 'vscode';
import { Logger } from './Logger';

export class ErrorHandler {
    constructor(private logger: Logger) { }
    handleError(error: unknown, operation: string): void {
        // Extract error message
        let errorMessage: string;
        if (error instanceof Error) {
            errorMessage = error.message;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else if (error && typeof error === 'object' && 'message' in error) {
            errorMessage = String((error as any).message);
        } else {
            errorMessage = String(error);
        }

        // Log the error
        this.logger.error(
            `Operation '${operation}' failed: ${errorMessage}`,
            'ErrorHandler',
            { error }
        );

        // Show user notification
        const userMessage = error instanceof Error ? error.message : operation;
        vscode.window.showErrorMessage(`❌ Error: ${userMessage}`);
    }
}