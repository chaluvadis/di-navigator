import * as vscode from 'vscode';

/**
 * Centralized Logging Service
 *
 * Provides structured logging with different levels and output channels.
 * Supports console logging and VSCode output channels.
 */
export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3
}


export class Logger {
    private outputChannel: vscode.OutputChannel;
    private logLevel: LogLevel = LogLevel.INFO;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('DI Navigator');
    }


    /**
     * Log a debug message
     * @param message Log message
     * @param category Optional category
     * @param data Optional data to log
     */
    debug(message: string, category?: string, data?: any): void {
        this.log(LogLevel.DEBUG, message, category, data);
    }

    /**
     * Log an info message
     * @param message Log message
     * @param category Optional category
     * @param data Optional data to log
     */
    info(message: string, category?: string, data?: any): void {
        this.log(LogLevel.INFO, message, category, data);
    }

    /**
     * Log a warning message
     * @param message Log message
     * @param category Optional category
     * @param data Optional data to log
     */
    warn(message: string, category?: string, data?: any): void {
        this.log(LogLevel.WARN, message, category, data);
    }

    /**
     * Log an error message
     * @param message Log message
     * @param category Optional category
     * @param data Optional data to log
     */
    error(message: string, category?: string, data?: any): void {
        this.log(LogLevel.ERROR, message, category, data);
    }

    /**
     * Internal logging method
     * @param level Log level
     * @param message Log message
     * @param category Optional category
     * @param data Optional data to log
     */
    private log(level: LogLevel, message: string, category?: string, data?: any): void {
        if (level < this.logLevel) {
            return;
        }

        // Format message
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        const prefix = category ? `[${category}] ` : '';
        const formattedMessage = `[${timestamp}] ${levelName}: ${prefix}${message}`;

        // Output to console
        const consoleMethod = level >= LogLevel.ERROR ? console.error :
            level >= LogLevel.WARN ? console.warn :
                level >= LogLevel.INFO ? console.log : console.debug;

        consoleMethod(formattedMessage);

        // Output to VSCode channel
        this.outputChannel.appendLine(formattedMessage);

        // Log data if provided
        if (data !== undefined) {
            const dataString = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
            this.outputChannel.appendLine(`  Data: ${dataString}`);
        }
    }
}