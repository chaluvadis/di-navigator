import * as vscode from 'vscode';
import { Logger } from './Logger';

/**
 * Centralized Error Handling Service
 *
 * Provides consistent error handling, user notifications, and error reporting
 * across the entire extension.
 */
export interface ErrorContext {
    operation: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    userMessage?: string;
    showNotification?: boolean;
    logError?: boolean;
}

export class ErrorHandler {
    constructor(private logger: Logger) {}

    /**
     * Handle an error with context
     * @param error The error that occurred
     * @param context Error context information
     */
    handleError(error: unknown, context: string | ErrorContext): void {
        const errorContext = typeof context === 'string'
            ? { operation: context }
            : context;

        // Log the error
        if (errorContext.logError !== false) {
            this.logger.error(
                this.formatErrorMessage(error, errorContext.operation),
                'ErrorHandler',
                { error, context: errorContext }
            );
        }

        // Show user notification
        if (errorContext.showNotification !== false) {
            this.showUserNotification(error, errorContext);
        }
    }

    /**
     * Handle an error that should be shown to the user
     * @param error The error that occurred
     * @param userMessage User-friendly error message
     */
    showError(error: unknown, userMessage: string): void {
        this.logger.error(userMessage, 'UserError', { error });

        const message = this.extractUserMessage(error, userMessage);
        vscode.window.showErrorMessage(message);
    }

    /**
     * Handle a warning that should be shown to the user
     * @param warning The warning message
     * @param action Optional action description
     */
    showWarning(warning: string, action?: string): void {
        this.logger.warn(warning, 'UserWarning', { action });

        const message = action ? `${warning} - ${action}` : warning;
        vscode.window.showWarningMessage(message);
    }

    /**
     * Handle an info message that should be shown to the user
     * @param info The info message
     * @param action Optional action description
     */
    showInfo(info: string, action?: string): void {
        this.logger.info(info, 'UserInfo', { action });

        const message = action ? `${info} - ${action}` : info;
        vscode.window.showInformationMessage(message);
    }

    /**
     * Create a user-friendly error message
     * @param error The error object
     * @param operation The operation that failed
     * @returns Formatted error message
     */
    private formatErrorMessage(error: unknown, operation: string): string {
        const errorMessage = this.extractErrorMessage(error);
        return `Operation '${operation}' failed: ${errorMessage}`;
    }

    /**
     * Extract a user-friendly message from an error
     * @param error The error object
     * @param fallbackMessage Fallback message if error is not parseable
     * @returns User-friendly error message
     */
    private extractUserMessage(error: unknown, fallbackMessage: string): string {
        if (error instanceof Error) {
            return error.message || fallbackMessage;
        }

        if (typeof error === 'string') {
            return error || fallbackMessage;
        }

        if (error && typeof error === 'object' && 'message' in error) {
            return String((error as any).message) || fallbackMessage;
        }

        return fallbackMessage;
    }

    /**
     * Extract the error message for logging
     * @param error The error object
     * @returns Error message for logging
     */
    private extractErrorMessage(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error && typeof error === 'object') {
            if ('message' in error && typeof (error as any).message === 'string') {
                return (error as any).message;
            }

            if ('stack' in error && typeof (error as any).stack === 'string') {
                return (error as any).stack;
            }

            return JSON.stringify(error);
        }

        return String(error);
    }

    /**
     * Show appropriate user notification based on error context
     * @param error The error that occurred
     * @param context Error context
     */
    private showUserNotification(error: unknown, context: ErrorContext): void {
        const userMessage = context.userMessage || this.extractUserMessage(error, context.operation);

        switch (context.severity) {
            case 'critical':
                vscode.window.showErrorMessage(`🚨 Critical Error: ${userMessage}`);
                break;
            case 'high':
                vscode.window.showErrorMessage(`❌ Error: ${userMessage}`);
                break;
            case 'medium':
                vscode.window.showWarningMessage(`⚠️ Warning: ${userMessage}`);
                break;
            case 'low':
            default:
                vscode.window.showInformationMessage(`ℹ️ Info: ${userMessage}`);
                break;
        }
    }

    /**
     * Wrap an async operation with error handling
     * @param operation The async operation to wrap
     * @param context Error context
     * @returns Promise that resolves to the operation result
     */
    async withErrorHandling<T>(
        operation: () => Promise<T>,
        context: string | ErrorContext
    ): Promise<T | undefined> {
        try {
            return await operation();
        } catch (error) {
            this.handleError(error, context);
            return undefined;
        }
    }

    /**
     * Wrap a sync operation with error handling
     * @param operation The sync operation to wrap
     * @param context Error context
     * @returns Operation result or undefined if error occurred
     */
    withErrorHandlingSync<T>(
        operation: () => T,
        context: string | ErrorContext
    ): T | undefined {
        try {
            return operation();
        } catch (error) {
            this.handleError(error, context);
            return undefined;
        }
    }
}