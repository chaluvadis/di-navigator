import * as vscode from 'vscode';
import { ServiceGroup, Service, Registration, Lifetime } from './models';
import { parseCsharp, extractRegistrations } from './parser';

export class ServiceProvider {
    private serviceGroups: ServiceGroup[] = [];
    private cache = new Map<string, ServiceGroup[]>();

    async collectRegistrations(): Promise<void> {
        const registrations: Registration[] = [];

        // Scan for C# files in workspace
        const config = vscode.workspace.getConfiguration('diNavigator');
        const excludePatterns = config.get<string[]>('excludeFolders') || ['**/bin/**', '**/obj/**', '**/Properties/**'];
        const excludeGlob = excludePatterns.join(', ');
        const csFiles = await vscode.workspace.findFiles('**/*.cs', excludeGlob);

        for (const file of csFiles) {
            try {
                const document = await vscode.workspace.openTextDocument(file);
                const sourceCode = document.getText();
                const rootNode = parseCsharp(sourceCode);
                const fileRegs = extractRegistrations(rootNode, file.fsPath);
                registrations.push(...fileRegs);
            } catch (error) {
                console.error(`Error parsing ${file.fsPath}:`, error);
            }
        }

        // Group into services
        const servicesByName = new Map<string, Service>();
        for (const reg of registrations) {
            let service = servicesByName.get(reg.serviceType) as Service;
            if (!service) {
                service = { name: reg.serviceType, registrations: [], hasConflicts: false, injectionSites: [] };
                servicesByName.set(reg.serviceType, service);
            }
            service.registrations.push(reg);
            // Basic conflict: multiple impls for same service in same lifetime
            const implsInLifetime = service.registrations.filter(r => r.lifetime === reg.lifetime).map(r => r.implementationType);
            if (new Set(implsInLifetime).size > 1) {
                service.hasConflicts = true;
            }
        }

        // Group by lifetime
        this.serviceGroups = [];
        const lifetimes = [Lifetime.Singleton, Lifetime.Scoped, Lifetime.Transient];
        for (const lifetime of lifetimes) {
            const services = Array.from(servicesByName.values()).filter(s => s.registrations.some(r => r.lifetime === lifetime));
            if (services.length > 0) {
                this.serviceGroups.push({
                    lifetime,
                    services,
                    color: this.getLifetimeColor(lifetime)
                });
            }
        }

        this.cache.set('default', this.serviceGroups);
    }

    private getLifetimeColor(lifetime: Lifetime): string {
        switch (lifetime) {
            case Lifetime.Singleton: return '#FF5722'; // Orange
            case Lifetime.Scoped: return '#2196F3'; // Blue
            case Lifetime.Transient: return '#4CAF50'; // Green
            default: return '#9E9E9E';
        }
    }

    getServiceGroups(): ServiceGroup[] {
        return this.serviceGroups;
    }

    async refresh(): Promise<void> {
        await this.collectRegistrations();
    }
}

// Global instance
export const serviceProvider = new ServiceProvider();