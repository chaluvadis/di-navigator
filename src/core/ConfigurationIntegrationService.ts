import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class ConfigurationIntegrationService {
    private readonly workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
    }

    /**
     * Get VSCode configuration and convert to Roslyn tool format
     */
    getRoslynToolConfiguration(): any {
        const config = vscode.workspace.getConfiguration('di-navigator');

        return {
            logLevel: config.get('logLevel', 'Info'),
            enableParallelProcessing: config.get('enableParallelProcessing', true),
            maxDegreeOfParallelism: config.get('maxDegreeOfParallelism', -1),
            fileSizeLimit: 10 * 1024 * 1024, // 10MB default
            excludedDirectories: ['bin', 'obj', 'node_modules', '.git'],
            supportedFileExtensions: ['.cs'],
            enableCaching: config.get('enableCaching', true),
            cacheExpirationMinutes: config.get('cacheExpirationMinutes', 30),
            outputFormat: config.get('outputFormat', 'Json'),
            includeSourceCodeInOutput: config.get('includeSourceCodeInOutput', false),
            analyzeThirdPartyContainers: config.get('analyzeThirdPartyContainers', false),
            thirdPartyContainerPatterns: ['Autofac', 'Ninject', 'Castle.Windsor'],
            pluginDirectory: config.get('pluginDirectory', 'plugins'),
            enablePlugins: config.get('enablePlugins', true)
        };
    }

    /**
     * Save current configuration to appsettings.json
     */
    async saveConfigurationToFile(): Promise<void> {
        try {
            const roslynConfig = this.getRoslynToolConfiguration();
            const configPath = path.join(this.workspaceRoot, 'roslyn-tool', 'appsettings.json');

            // Ensure directory exists
            const configDir = path.dirname(configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // Write configuration
            fs.writeFileSync(configPath, JSON.stringify(roslynConfig, null, 2));

            vscode.window.showInformationMessage('DI Navigator: Configuration saved to appsettings.json');
        } catch (error) {
            vscode.window.showErrorMessage(`DI Navigator: Failed to save configuration - ${error}`);
            throw error;
        }
    }

    /**
     * Load configuration from appsettings.json
     */
    loadConfigurationFromFile(): any {
        try {
            const configPath = path.join(this.workspaceRoot, 'roslyn-tool', 'appsettings.json');

            if (fs.existsSync(configPath)) {
                const configContent = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(configContent);
            }
        } catch (error) {
            console.warn('Failed to load configuration from file:', error);
        }

        return null;
    }

    /**
     * Sync VSCode settings with Roslyn tool configuration
     */
    async syncConfigurations(): Promise<void> {
        try {
            // Load existing configuration from file
            const fileConfig = this.loadConfigurationFromFile();

            if (fileConfig) {
                // Merge with VSCode configuration
                const vscodeConfig = this.getRoslynToolConfiguration();
                const mergedConfig = { ...fileConfig, ...vscodeConfig };

                // Save back to file
                await this.saveConfigurationToFile();
            } else {
                // Save VSCode configuration to file
                await this.saveConfigurationToFile();
            }
        } catch (error) {
            console.warn('Failed to sync configurations:', error);
        }
    }

    /**
     * Validate current configuration
     */
    validateConfiguration(): string[] {
        const errors: string[] = [];
        const config = vscode.workspace.getConfiguration('di-navigator');

        // Validate refresh interval
        const refreshInterval = config.get('refreshInterval', 5000);
        if (refreshInterval < 1000) {
            errors.push('Refresh interval must be at least 1000ms');
        }

        // Validate cache expiration
        const cacheExpiration = config.get('cacheExpirationMinutes', 30);
        if (cacheExpiration < 1) {
            errors.push('Cache expiration must be at least 1 minute');
        }

        // Validate log level
        const logLevel = config.get('logLevel', 'Info');
        const validLogLevels = ['Debug', 'Info', 'Warning', 'Error'];
        if (!validLogLevels.includes(logLevel)) {
            errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
        }

        return errors;
    }
}