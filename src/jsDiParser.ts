import * as fs from 'fs/promises';
import * as path from 'path';
import { Registration, InjectionSite, Lifetime, ProjectDI, ServiceGroup, Conflict } from './models';
import { RelativePattern, Uri, workspace } from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ParseResult {
    registrations: Registration[];
    injectionSites: InjectionSite[];
    errors: string[];
}

export interface DIContainerConfig {
    name: string;
    registrationPatterns: {
        singleton: RegExp[];
        scoped: RegExp[];
        transient: RegExp[];
    };
    injectionPatterns: RegExp[];
    extractServiceType: (match: RegExpExecArray) => string;
    extractImplementationType: (match: RegExpExecArray) => string;
}

export class JSDIParser {
    private containers: Map<string, DIContainerConfig> = new Map();
    private useExternalTools: boolean = true;

    constructor() {
        this.initializeContainerConfigs();
    }

    /**
     * Enable or disable external tool usage
     */
    public setUseExternalTools(useExternal: boolean): void {
        this.useExternalTools = useExternal;
        console.log(`DI Navigator: External tools ${useExternal ? 'enabled' : 'disabled'}`);
    }

    private initializeContainerConfigs(): void {
        // Microsoft.Extensions.DependencyInjection configuration
        this.containers.set('Microsoft.Extensions.DependencyInjection', {
            name: 'Microsoft.Extensions.DependencyInjection',
            registrationPatterns: {
                singleton: [
                    // Standard patterns - handle both syntaxes
                    /services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    /builder\.Services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    // With parameters
                    /services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /builder\.Services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    // More flexible patterns for complex expressions
                    /(\w+(?:\.\w+)*)\.AddSingleton\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddSingleton\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    // Handle syntax like: services.AddSingleton<ISystemClock, SystemClock>()
                    /(\w+(?:\.\w+)*)\.AddSingleton<([^>]+)>\s*\(\s*\)/g,
                    /(\w+(?:\.\w+)*)\.AddSingleton<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g,
                    // Handle factory registrations with lambda
                    /(\w+(?:\.\w+)*)\.AddSingleton<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g,
                    /(\w+(?:\.\w+)*)\.AddSingleton<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g,
                    // Additional patterns for API/Web projects
                    /(\w+(?:\.\w+)*)\.AddControllers\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddEndpointsApiExplorer\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddOpenApi\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddHttpClient\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddCors\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddRazorComponents\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddRazorPages\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddMemoryCache\(\)/g,
                    /(\w+(?:\.\w+)*)\.AddQuartz\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddQuartzHostedService\([^)]*\)/g,
                    // Generic extension method pattern for custom methods
                    /(\w+(?:\.\w+)*)\.Add(\w+)(?:<[^>]*>)?\s*\([^)]*\)/g,
                    // TryAdd patterns
                    /(\w+(?:\.\w+)*)\.TryAdd(\w+)(?:<[^>]*>)?\s*\([^)]*\)/g,
                    // Configure patterns
                    /(\w+(?:\.\w+)*)\.Configure<(\w+)>\([^)]*\)/g
                ],
                scoped: [
                    /services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    /builder\.Services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    /services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /builder\.Services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddScoped\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddScoped\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    // Handle syntax like: services.AddScoped<IOrchestratorRepository, SQLiteOrchestratorRepository>()
                    /(\w+(?:\.\w+)*)\.AddScoped<([^>]+)>\s*\(\s*\)/g,
                    /(\w+(?:\.\w+)*)\.AddScoped<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g,
                    // Handle factory registrations with lambda
                    /(\w+(?:\.\w+)*)\.AddScoped<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g,
                    /(\w+(?:\.\w+)*)\.AddScoped<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g
                ],
                transient: [
                    /services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    /builder\.Services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    /services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /builder\.Services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddTransient\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddTransient\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                    // Handle syntax like: services.AddTransient<IService, Implementation>()
                    /(\w+(?:\.\w+)*)\.AddTransient<([^>]+)>\s*\(\s*\)/g,
                    /(\w+(?:\.\w+)*)\.AddTransient<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g,
                    // Handle factory registrations with lambda
                    /(\w+(?:\.\w+)*)\.AddTransient<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g,
                    /(\w+(?:\.\w+)*)\.AddTransient<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g,
                    // Extension methods that should be Transient
                    /(\w+(?:\.\w+)*)\.AddHttpClient\(\s*\)/g,
                    /(\w+(?:\.\w+)*)\.AddHttpClient\([^)]*\)/g,
                    /(\w+(?:\.\w+)*)\.AddMemoryCache\(\s*\)/g,
                    /(\w+(?:\.\w+)*)\.AddMemoryCache\([^)]*\)/g
                ]
            },
            injectionPatterns: [
                // Constructor injection: captures class name and constructor parameters
                // Handles multi-line class declarations and constructors
                /class\s+(\w+(?:\.\w+)*)\s*[:\w\s,]*\s*\n[^}]*?\([^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Alternative constructor pattern for single-line declarations
                /class\s+(\w+(?:\.\w+)*)\s*[:\w\s,]*\([^)]*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Property injection: captures class name and property type
                /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+(\w+)\s*\{[^}]*get;[^}]*set;[^}]*\}/g,
                // Method parameter injection: captures method parameters (including constructors)
                /(?:public|private|protected|internal)?\s*(?:async\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Generic injection patterns with better context - handles readonly fields
                /readonly\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Generic injection patterns with better context - handles private fields
                /private\s+(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Generic injection patterns with better context - handles any field
                /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // Factory lambda patterns - handles sp => expressions
                /(?:sp|provider)\s*=>\s*[^}]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g,
                // GetRequiredService<T> patterns
                /GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g,
                // GetService<T> patterns
                /GetService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g,
                // GetRequiredService() method calls
                /GetRequiredService\(\s*\)/g,
                // GetService() method calls
                /GetService\(\s*\)/g,
                // Complex lambda configurations - AddOpenApi with options
                /AddOpenApi\([^)]*\([^)]*=>[^}]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^}]*\}\s*\)/g,
                // Complex lambda configurations - AddCors with options
                /AddCors\([^)]*\([^)]*=>[^}]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^}]*\}\s*\)/g,
                // Service resolution in application code - GetRequiredService<T>()
                /GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>\(\s*\)/g,
                // Service resolution in application code - GetService<T>()
                /GetService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>\(\s*\)/g,
                // Service provider resolution patterns
                /(?:ServiceProvider|sp)\.GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g,
                /(?:ServiceProvider|sp)\.GetService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g,
                // Constructor injection with better pattern matching
                /public\s+(\w+(?:\.\w+)*)\s*\(\s*[^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^)]*\)/g,
                // Private constructor injection
                /private\s+(\w+(?:\.\w+)*)\s*\(\s*[^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^)]*\)/g
            ],
            extractServiceType: (match: RegExpExecArray) => {
                // Handle different capture groups based on pattern
                // Patterns with two types: match[2] = service, match[3] = implementation
                // Patterns with one type: match[2] = service
                // Patterns without types (like AddControllers): match[1] = method name
                // New patterns: GetRequiredService<T> uses match[1], factory lambdas use match[1]

                // Check for service type in different capture groups
                if (match[2] && match[3]) {
                    // Two types: service, implementation - match[2] is service type
                    return match[2]?.trim() || 'Unknown';
                } else if (match[2]) {
                    // One type: service only - match[2] is service type
                    return match[2]?.trim() || 'Unknown';
                } else if (match[1]) {
                    // Single type patterns (including new patterns) - match[1] is service type
                    return match[1]?.trim() || 'Unknown';
                }

                // For patterns like AddControllers(), extract from method name
                // Remove common prefixes and extract the service name
                const methodCall = match[0]?.trim() || '';
                const serviceMatch = methodCall.match(/\.Add(\w+)(?:<|$)/);
                if (serviceMatch) {
                    return serviceMatch[1];
                }

                // Handle factory lambda patterns where service type is in match[1]
                if (methodCall.includes('=>') && match[1]) {
                    return match[1]?.trim() || 'Unknown';
                }

                return 'Unknown';
            },
            extractImplementationType: (match: RegExpExecArray) => {
                // Handle different capture groups based on pattern
                if (match[3]) {
                    // Two types: service, implementation - match[3] is implementation type
                    return match[3]?.trim() || 'Unknown';
                } else if (match[2]) {
                    // One type: service only (implementation = service) - match[2] is both service and implementation
                    return match[2]?.trim() || 'Unknown';
                }

                // For patterns like AddControllers(), implementation = method name
                const methodCall = match[0]?.trim() || '';
                if (methodCall.includes('AddControllers')) {
                    return 'Controller';
                } else if (methodCall.includes('AddEndpointsApiExplorer')) {
                    return 'EndpointsApiExplorer';
                } else if (methodCall.includes('AddOpenApi')) {
                    return 'OpenApi';
                } else if (methodCall.includes('AddHttpClient')) {
                    return 'HttpClient';
                } else if (methodCall.includes('AddCors')) {
                    return 'Cors';
                } else if (methodCall.includes('AddMemoryCache')) {
                    return 'MemoryCache';
                }

                // For factory lambdas, implementation is the lambda expression
                if (methodCall.includes('=>')) {
                    return 'Factory';
                }

                return match[1]?.trim() || 'Unknown';
            },
        });
    }

    async parseFile(filePath: string): Promise<ParseResult> {
        try {
            const source = await fs.readFile(filePath, 'utf8');
            const result: ParseResult = {
                registrations: [],
                injectionSites: [],
                errors: []
            };

            // Parse registrations using the built-in Microsoft DI container
            const config = this.containers.get('Microsoft.Extensions.DependencyInjection');
            if (!config) {
                return {
                    registrations: [],
                    injectionSites: [],
                    errors: ['Microsoft.Extensions.DependencyInjection configuration not found']
                };
            }

            console.log(`DI Navigator: Parsing with container Microsoft.Extensions.DependencyInjection`);

            try {
                const patternResults = this.parseWithPatterns(source, config, filePath);
                const fallbackResults = this.parseWithFallback(source, config, filePath);

                result.registrations.push(...patternResults.registrations);
                result.registrations.push(...fallbackResults.registrations);

                result.injectionSites.push(...patternResults.injectionSites);
                result.injectionSites.push(...fallbackResults.injectionSites);

                result.errors.push(...patternResults.errors);
                result.errors.push(...fallbackResults.errors);

            } catch (error) {
                result.errors.push(`Error parsing Microsoft.Extensions.DependencyInjection: ${error}`);
            }

            return result;
        } catch (error) {
            return {
                registrations: [],
                injectionSites: [],
                errors: [`Failed to parse file ${filePath}: ${error}`]
            };
        }
    }

    private parseWithPatterns(source: string, config: DIContainerConfig, filePath: string): ParseResult {
        const result: ParseResult = {
            registrations: [],
            injectionSites: [],
            errors: []
        };

        try {
            // Parse registrations for each lifetime
            for (const lifetime of ['singleton', 'scoped', 'transient'] as const) {
                const patterns = config.registrationPatterns[lifetime];
                for (const pattern of patterns) {
                    const matches = this.findAllMatches(source, pattern);
                    console.log(`DI Navigator: Found ${matches.length} ${lifetime} matches with pattern ${pattern.source}`);

                    for (const match of matches) {
                        console.log(`DI Navigator: ${lifetime} match: ${match[0]}`);
                        const registration = this.createRegistration(
                            match,
                            config,
                            lifetime === 'singleton' ? Lifetime.Singleton :
                            lifetime === 'scoped' ? Lifetime.Scoped : Lifetime.Transient,
                            filePath,
                            source
                        );
                        if (registration) {
                            result.registrations.push(registration);
                        }
                    }
                }
            }

            // Parse injection sites
            for (const pattern of config.injectionPatterns) {
                const matches = this.findAllMatches(source, pattern);
                console.log(`DI Navigator: Found ${matches.length} injection site matches with pattern ${pattern.source}`);

                for (const match of matches) {
                    console.log(`DI Navigator: Injection site match: ${match[0]}`);
                    const injection = this.createInjectionSite(
                        match,
                        config,
                        filePath,
                        source
                    );
                    if (injection) {
                        result.injectionSites.push(injection);
                    }
                }
            }
        } catch (error) {
            result.errors.push(`Pattern parsing error: ${error}`);
        }

        return result;
    }





    private parseWithFallback(source: string, config: DIContainerConfig, filePath: string): ParseResult {
        const result: ParseResult = {
            registrations: [],
            injectionSites: [],
            errors: []
        };

        try {
            // Generic fallback patterns for common DI registration syntax
            const fallbackPatterns = [
                // Generic AddXxx patterns
                /(\w+(?:\.\w+)*)\.Add(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                /(\w+(?:\.\w+)*)\.Add(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                // TryAddXxx patterns
                /(\w+(?:\.\w+)*)\.TryAdd(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                /(\w+(?:\.\w+)*)\.TryAdd(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g,
                // Keyed patterns
                /(\w+(?:\.\w+)*)\.AddKeyed(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g,
                /(\w+(?:\.\w+)*)\.AddKeyed(\w+)\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g
            ];

            for (const pattern of fallbackPatterns) {
                const matches = this.findAllMatches(source, pattern);
                console.log(`DI Navigator: Found ${matches.length} fallback matches with pattern ${pattern.source}`);

                for (const match of matches) {
                    const methodName = match[2];
                    let lifetime: Lifetime;

                    // Determine lifetime based on method name
                    if (methodName.toLowerCase().includes('singleton')) {
                        lifetime = Lifetime.Singleton;
                    } else if (methodName.toLowerCase().includes('scoped')) {
                        lifetime = Lifetime.Scoped;
                    } else if (methodName.toLowerCase().includes('transient')) {
                        lifetime = Lifetime.Transient;
                    } else {
                        // Default to transient for unknown patterns
                        lifetime = Lifetime.Transient;
                    }

                    const registration = this.createRegistration(match, config, lifetime, filePath, source);
                    if (registration) {
                        result.registrations.push(registration);
                    }
                }
            }
        } catch (error) {
            result.errors.push(`Fallback parsing error: ${error}`);
        }

        return result;
    }

    private findAllMatches(source: string, pattern: RegExp): RegExpExecArray[] {
        const matches: RegExpExecArray[] = [];
        let match;
        pattern.lastIndex = 0; // Reset regex state

        while ((match = pattern.exec(source)) !== null) {
            matches.push(match);
        }

        return matches;
    }

    private createRegistration(
        match: RegExpExecArray,
        config: DIContainerConfig,
        lifetime: Lifetime,
        filePath: string,
        source: string
    ): Registration | null {
        try {
            const serviceType = config.extractServiceType(match);
            const implementationType = config.extractImplementationType(match);

            if (!serviceType || serviceType === 'Unknown') {
                return null;
            }

            const lineNumber = this.getLineNumberFromMatch(source, match.index);

            return {
                id: `reg-${path.basename(filePath)}-${lineNumber}`,
                lifetime,
                serviceType,
                implementationType,
                filePath,
                lineNumber,
                methodCall: match[0]
            };
        } catch (error) {
            console.error('Error creating registration:', error);
            return null;
        }
    }

    private createInjectionSite(
        match: RegExpExecArray,
        config: DIContainerConfig,
        filePath: string,
        source: string
    ): InjectionSite | null {
        try {
            const serviceType = config.extractServiceType(match);

            if (!serviceType || serviceType === 'Unknown') {
                return null;
            }

            const lineNumber = this.getLineNumberFromMatch(source, match.index);

            // Extract class name and member name based on pattern type
            let className = 'UnknownClass';
            let memberName = 'constructor';
            let injectionType: 'constructor' | 'method' | 'field' = 'constructor';

            // Pattern 1: Multi-line constructor injection - class\s+(\w+(?:\.\w+)*)\s*[:\w\s,]*\s*\n[^}]*?\([^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            if (match.length >= 3 && match[1] && match[2]) {
                className = match[1];
                memberName = 'constructor';
                injectionType = 'constructor';
            }
            // Pattern 2: Single-line constructor injection - class\s+(\w+(?:\.\w+)*)\s*[:\w\s,]*\([^)]*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 3 && match[1] && match[2]) {
                className = match[1];
                memberName = 'constructor';
                injectionType = 'constructor';
            }
            // Pattern 3: Property injection - ([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+(\w+)\s*\{[^}]*get;[^}]*set;[^}]*\}
            else if (match.length >= 3 && match[2]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = match[2]; // Property name
                injectionType = 'field';
            }
            // Pattern 4: Method parameter injection - (?:public|private|protected|internal)?\s*(?:async\s+)?(?:\w+\s+)?(\w+)\s*\([^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 3 && match[1] && match[2]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = match[1]; // Method name
                injectionType = 'method';
            }
            // Pattern 5: Readonly field injection - readonly\s+([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'field';
                injectionType = 'field';
            }
            // Pattern 6: Private field injection - private\s+(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'field';
                injectionType = 'field';
            }
            // Pattern 7: Generic fallback - ([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'constructor';
                injectionType = 'constructor';
            }
            // Pattern 8: Factory lambda patterns - (?:sp|provider)\s*=>\s*[^}]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'factory';
                injectionType = 'method';
            }
            // Pattern 9: GetRequiredService<T> patterns - GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetRequiredService';
                injectionType = 'method';
            }
            // Pattern 10: GetService<T> patterns - GetService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetService';
                injectionType = 'method';
            }
            // Pattern 11: GetRequiredService() method calls - GetRequiredService\(\s*\)
            else if (match.length >= 1) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetRequiredService';
                injectionType = 'method';
            }
            // Pattern 12: GetService() method calls - GetService\(\s*\)
            else if (match.length >= 1) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetService';
                injectionType = 'method';
            }
            // Pattern 13: Complex lambda configurations - AddOpenApi with options
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'AddOpenApi';
                injectionType = 'method';
            }
            // Pattern 14: Complex lambda configurations - AddCors with options
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'AddCors';
                injectionType = 'method';
            }
            // Pattern 15: Service resolution in application code - GetRequiredService<T>()
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetRequiredService';
                injectionType = 'method';
            }
            // Pattern 16: Service resolution in application code - GetService<T>()
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetService';
                injectionType = 'method';
            }
            // Pattern 17: Service provider resolution patterns - ServiceProvider.GetRequiredService<T>
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetRequiredService';
                injectionType = 'method';
            }
            // Pattern 18: Service provider resolution patterns - ServiceProvider.GetService<T>
            else if (match.length >= 2 && match[1]) {
                className = this.extractClassNameFromContext(source, match.index);
                memberName = 'GetService';
                injectionType = 'method';
            }

            return {
                filePath,
                lineNumber,
                className,
                memberName,
                type: injectionType,
                serviceType,
                linkedRegistrationIds: []
            };
        } catch (error) {
            console.error('Error creating injection site:', error);
            return null;
        }
    }

    private getLineNumberFromMatch(source: string, matchIndex: number): number {
        return source.substring(0, matchIndex).split('\n').length;
    }

    private extractClassNameFromContext(source: string, matchIndex: number): string {
        try {
            // Look backwards from the match to find class declaration
            const lines = source.substring(0, matchIndex).split('\n');
            let currentLineIndex = lines.length - 1;

            // Search backwards through lines for class declaration
            for (let i = currentLineIndex; i >= 0; i--) {
                const line = lines[i].trim();

                // Look for class declaration
                const classMatch = line.match(/^(?:public|private|protected|internal)?\s*(?:abstract\s+)?(?:sealed\s+)?(?:static\s+)?class\s+(\w+(?:\.\w+)*)/);
                if (classMatch) {
                    return classMatch[1];
                }

                // Stop searching if we hit another class/struct/interface declaration
                if (line.match(/^(?:public|private|protected|internal)?\s*(?:abstract\s+)?(?:sealed\s+)?(?:static\s+)?(?:class|struct|interface)\s+/)) {
                    break;
                }

                // Stop searching if we hit namespace declaration
                if (line.match(/^namespace\s+/)) {
                    break;
                }
            }

            // If no class found, try to extract from current context
            const currentLine = lines[currentLineIndex];
            const contextMatch = currentLine.match(/class\s+(\w+(?:\.\w+)*)/);
            if (contextMatch) {
                return contextMatch[1];
            }

            return 'UnknownClass';
        } catch (error) {
            console.error('Error extracting class name from context:', error);
            return 'UnknownClass';
        }
    }

    async parseProject(projectPath: string): Promise<ProjectDI> {
        try {
            console.log(`🔍 DI Navigator: === STARTING PROJECT PARSING ===`);
            console.log(`📁 DI Navigator: Parsing project at ${projectPath}`);
            console.log(`🔧 DI Navigator: External tools enabled: ${this.useExternalTools}`);

            // Strategy 1: Try external tool-based parsing first
            if (this.useExternalTools) {
                try {
                    console.log(`🔧 DI Navigator: Attempting external tool-based parsing`);
                    const externalResult = await this.parseProjectWithExternalTools(projectPath);
                    console.log(`📊 DI Navigator: External tool result - service groups: ${externalResult.serviceGroups.length}`);
                    if (externalResult.serviceGroups.length > 0) {
                        console.log(`✅ DI Navigator: External tool parsing successful, found ${externalResult.serviceGroups.length} service groups`);
                        console.log(`🔍 DI Navigator: === PROJECT PARSING COMPLETED (External) ===`);
                        return externalResult;
                    }
                } catch (error) {
                    console.log(`❌ DI Navigator: External tool parsing failed, falling back to regex-based parsing: ${error}`);
                }
            }

            // Strategy 2: Fallback to enhanced regex-based parsing
            console.log(`DI Navigator: Using enhanced regex-based parsing`);
            const projectUri = Uri.file(projectPath);
            const csFiles = await workspace.findFiles(
                new RelativePattern(projectUri, '**/*.cs'),
                '**/{bin,obj,Properties}/**'
            );

            console.log(`DI Navigator: Found ${csFiles.length} C# files to parse`);
            csFiles.forEach(file => console.log(`  - ${file.fsPath}`));

            const allRegistrations: Registration[] = [];
            const allInjectionSites: InjectionSite[] = [];
            const errors: string[] = [];

            // Parse all C# files
            for (const fileUri of csFiles) {
                try {
                    console.log(`DI Navigator: Parsing file ${fileUri.fsPath}`);
                    const result = await this.parseFile(fileUri.fsPath);
                    console.log(`DI Navigator: Found ${result.registrations.length} registrations and ${result.injectionSites.length} injection sites in ${fileUri.fsPath}`);
                    allRegistrations.push(...result.registrations);
                    allInjectionSites.push(...result.injectionSites);
                    errors.push(...result.errors);
                } catch (error) {
                    console.error(`DI Navigator: Failed to parse ${fileUri.fsPath}:`, error);
                    errors.push(`Failed to parse ${fileUri.fsPath}: ${error}`);
                }
            }

            console.log(`DI Navigator: Total registrations found: ${allRegistrations.length}`);
            console.log(`DI Navigator: Total injection sites found: ${allInjectionSites.length}`);

            // Link injection sites to registrations
            this.linkInjectionSites(allInjectionSites, allRegistrations);

            // Group services by method prefix
            const serviceGroups = this.groupServicesByMethodPrefix(allRegistrations, allInjectionSites);

            console.log(`📊 DI Navigator: Final results:`);
            console.log(`  - Service groups: ${serviceGroups.length}`);
            console.log(`  - Total services: ${serviceGroups.reduce((acc, sg) => acc + sg.services.length, 0)}`);
            console.log(`  - Errors: ${errors.length}`);
            console.log(`  - Parse status: ${errors.length > 0 ? 'partial' : 'success'}`);

            const result = {
                projectPath,
                projectName: path.basename(projectPath),
                serviceGroups,
                cycles: [], // TODO: Implement cycle detection
                dependencyGraph: {}, // TODO: Implement dependency graph
                parseStatus: errors.length > 0 ? 'partial' as const : 'success' as const,
                errorDetails: errors.length > 0 ? errors : undefined
            };

            console.log(`✅ DI Navigator: === PROJECT PARSING COMPLETED (Regex) ===`);
            console.log(`📊 DI Navigator: Final project result:`, {
                projectName: result.projectName,
                serviceGroupsCount: result.serviceGroups.length,
                totalServices: result.serviceGroups.reduce((acc, sg) => acc + sg.services.length, 0),
                parseStatus: result.parseStatus
            });

            return result;
        } catch (error) {
            console.log(`❌ DI Navigator: === PROJECT PARSING FAILED ===`);
            console.log(`❌ DI Navigator: Error: ${error}`);
            console.log(`📁 DI Navigator: Failed project: ${projectPath}`);

            return {
                projectPath,
                projectName: path.basename(projectPath),
                serviceGroups: [],
                cycles: [],
                dependencyGraph: {},
                parseStatus: 'failed' as const,
                errorDetails: [`Failed to parse project: ${error}`]
            };
        }
    }

    private async parseProjectWithExternalTools(projectPath: string): Promise<ProjectDI> {
        try {
            // Try to find .csproj file
            const projectUri = Uri.file(projectPath);
            const csprojFiles = await workspace.findFiles(
                new RelativePattern(projectUri, '**/*.csproj')
            );

            if (csprojFiles.length === 0) {
                throw new Error('No .csproj file found');
            }

            const csprojFile = csprojFiles[0].fsPath;
            console.log(`DI Navigator: Found .csproj file: ${csprojFile}`);

            // Try using dotnet CLI to analyze the project
            try {
                const { stdout, stderr } = await execAsync(`dotnet build "${csprojFile}" --no-restore`, {
                    cwd: path.dirname(csprojFile),
                    timeout: 30000
                });

                console.log(`DI Navigator: Build output: ${stdout}`);
                if (stderr) {
                    console.log(`DI Navigator: Build warnings/errors: ${stderr}`);
                }

                // Look for compiled DLL
                const outputDir = path.join(path.dirname(csprojFile), 'bin/Debug/net6.0');
                const dllFiles = await fs.readdir(outputDir);
                const dllFile = dllFiles.find(f => f.endsWith('.dll'));

                if (dllFile) {
                    console.log(`DI Navigator: Found compiled DLL: ${dllFile}`);
                    // Use dotnet-roslyn or reflection to analyze DI registrations
                    return await this.analyzeCompiledAssembly(path.join(outputDir, dllFile), projectPath);
                }

            } catch (buildError) {
                console.log(`DI Navigator: Build failed, trying alternative approach: ${buildError}`);
            }

            // Fallback: Try using Roslyn compiler directly
            return await this.analyzeWithRoslyn(csprojFile, projectPath);

        } catch (error) {
            console.log(`DI Navigator: External tool parsing failed: ${error}`);
            throw error;
        }
    }

    private async analyzeCompiledAssembly(dllPath: string, projectPath: string): Promise<ProjectDI> {
        // This would use reflection or external tools to analyze the compiled assembly
        // For now, return empty result as placeholder
        console.log(`DI Navigator: Analyzing compiled assembly: ${dllPath}`);
        return {
            projectPath,
            projectName: path.basename(projectPath),
            serviceGroups: [],
            cycles: [],
            dependencyGraph: {},
            parseStatus: 'partial',
            errorDetails: ['Compiled assembly analysis not yet implemented']
        };
    }

    private async analyzeWithRoslyn(csprojFile: string, projectPath: string): Promise<ProjectDI> {
        // This would use Roslyn compiler APIs to analyze source code
        // For now, return empty result as placeholder
        console.log(`DI Navigator: Analyzing with Roslyn: ${csprojFile}`);
        return {
            projectPath,
            projectName: path.basename(projectPath),
            serviceGroups: [],
            cycles: [],
            dependencyGraph: {},
            parseStatus: 'partial',
            errorDetails: ['Roslyn analysis not yet implemented']
        };
    }

    private linkInjectionSites(injectionSites: InjectionSite[], registrations: Registration[]): void {
        for (const site of injectionSites) {
            const matchingRegistrations = registrations.filter(
                reg => reg.serviceType === site.serviceType
            );
            site.linkedRegistrationIds = matchingRegistrations.map(reg => reg.id);
        }
    }

    private groupServicesByMethodPrefix(registrations: Registration[], allInjectionSites: InjectionSite[]): ServiceGroup[] {
        const servicesByType = new Map<string, {
            name: string;
            registrations: Registration[];
            injectionSites: InjectionSite[];
            hasConflicts: boolean;
            conflicts?: Conflict[];
        }>();

        // Group registrations by service type
        for (const reg of registrations) {
            let service = servicesByType.get(reg.serviceType);
            if (!service) {
                service = {
                    name: reg.serviceType,
                    registrations: [],
                    injectionSites: [],
                    hasConflicts: false,
                    conflicts: []
                };
                servicesByType.set(reg.serviceType, service);
            }
            service.registrations.push(reg);
        }

        // Link injection sites
        for (const site of allInjectionSites) {
            const service = servicesByType.get(site.serviceType);
            if (service) {
                service.injectionSites.push(site);
            }
        }

        // Detect conflicts
        for (const service of servicesByType.values()) {
            const lifetimes = new Set(service.registrations.map(r => r.lifetime));
            if (lifetimes.size > 1) {
                service.hasConflicts = true;
                service.conflicts = service.conflicts || [];
                service.conflicts.push({
                    type: 'MixedLifetimes',
                    details: `Multiple lifetimes: ${Array.from(lifetimes).join(', ')}`
                });
            }
        }

        // Group by method prefix (AddSingleton -> Singleton, AddScoped -> Scoped, AddTransient -> Transient, Others -> Others)
        const groups: ServiceGroup[] = [];
        const methodPrefixOrder = [Lifetime.Singleton, Lifetime.Scoped, Lifetime.Transient, Lifetime.Others];

        for (const methodPrefix of methodPrefixOrder) {
            const methodPrefixServices = Array.from(servicesByType.values())
                .filter(s => s.registrations.some(r => {
                    // Extract method name from methodCall using improved extraction
                    const methodCall = r.methodCall;
                    const methodName = this.extractMethodName(methodCall);

                    // Map method prefix to lifetime
                    if (methodName.startsWith('AddSingleton')) {
                        return methodPrefix === Lifetime.Singleton;
                    } else if (methodName.startsWith('AddScoped')) {
                        return methodPrefix === Lifetime.Scoped;
                    } else if (methodName.startsWith('AddTransient')) {
                        return methodPrefix === Lifetime.Transient;
                    } else if (methodName === 'AddHttpClient' || methodName === 'AddMemoryCache') {
                        // Extension methods that should be Transient
                        return methodPrefix === Lifetime.Transient;
                    } else {
                        return methodPrefix === Lifetime.Others;
                    }
                }));

            if (methodPrefixServices.length > 0) {
                groups.push({
                    lifetime: methodPrefix,
                    services: methodPrefixServices,
                    color: this.getLifetimeColor(methodPrefix)
                });
            }
        }

        return groups;
    }

    private getLifetimeColor(lifetime: Lifetime): string {
        switch (lifetime) {
            case Lifetime.Singleton: return '#FF5722';
            case Lifetime.Scoped: return '#2196F3';
            case Lifetime.Transient: return '#4CAF50';
            default: return '#9E9E9E';
        }
    }

    /**
     * Extract the actual method name from a DI registration call
     * Handles complex method names like AddWorkflowOrchestratorDatabase
     */
    private extractMethodName(methodCall: string): string {
        try {
            // Remove common prefixes like "services.", "builder.Services.", etc.
            let cleanedCall = methodCall.trim();

            // Remove common service collection prefixes
            cleanedCall = cleanedCall.replace(/^(?:services|builder\.Services|container)\./i, '');

            // Pattern to match method names that start with "Add", "TryAdd", etc.
            // This handles complex method names like AddWorkflowOrchestratorDatabase
            const methodMatch = cleanedCall.match(/^(\w+)(?:<.*>)?(?:\s*\()/);
            if (methodMatch) {
                return methodMatch[1];
            }

            // Fallback: try to extract any word before generic parameters or parentheses
            const fallbackMatch = cleanedCall.match(/^(\w+)/);
            if (fallbackMatch) {
                return fallbackMatch[1];
            }

            // Last resort: return the cleaned method call
            return cleanedCall;
        } catch (error) {
            console.error('Error extracting method name:', error);
            return methodCall.trim();
        }
    }
}
