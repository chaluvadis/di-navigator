import * as assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../extension';
import sinon, { SinonStub } from 'sinon';
import { serviceProvider } from '../serviceProvider';
import { Lifetime, Service } from '../models';
import * as Commands from '../commands';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	test('detectNetWorkspace with .NET files', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		const originalGetConfiguration = vscode.workspace.getConfiguration;

		vscode.workspace.getConfiguration = () => ({
			get: (section: string) => {
				if (section === 'diNavigator.excludeFolders') {
					return ['**/bin/**', '**/obj/**', '**/Properties/**'];
				}
				return undefined;
			},
			has: () => false,
			inspect: () => undefined,
			update: async () => { }
		});

		vscode.workspace.findFiles = async (
			include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => {
			const includeStr = typeof include === 'string' ? include : include.pattern;
			if (includeStr.includes('.csproj') || includeStr.includes('.sln') || includeStr.includes('.slnx')) {
				return [vscode.Uri.file('/test/test.csproj')];
			}
			return [];
		};

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, true);

		vscode.workspace.findFiles = originalFindFiles;
		vscode.workspace.getConfiguration = originalGetConfiguration;
	});

	test('detectNetWorkspace without .NET files', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [];

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
	});

	test('detectNetWorkspace handles error', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => {
			throw new Error('Test error');
		};

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
	});

	test('activation sets context true for .NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;

		vscode.workspace.findFiles = async () => [vscode.Uri.file('test.csproj')];

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		sinon.assert.calledWith(setContextStub, 'setContext', 'diNavigator:validWorkspace', true);
		sinon.assert.calledOnce(refreshStub);
		sinon.assert.notCalled(clearStub);

		vscode.workspace.findFiles = originalFindFiles;
		setContextStub.restore();
		refreshStub.restore();
		clearStub.restore();
	});

	test('activation sets context false for non-.NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [];

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		sinon.assert.calledWith(setContextStub, 'setContext', 'diNavigator:validWorkspace', false);
		sinon.assert.notCalled(refreshStub);
		sinon.assert.calledOnce(clearStub);

		vscode.workspace.findFiles = originalFindFiles;
		setContextStub.restore();
		refreshStub.restore();
		clearStub.restore();
	});
});
afterEach(() => {
	sinon.restore();
});

suite('ServiceProvider Tests', () => {
	test('refresh calls collect if dirty', async () => {
		const mockContext = { workspaceState: { get: sinon.stub().returns(undefined), update: sinon.stub() }, globalState: { get: sinon.stub().returns(undefined) } };
		serviceProvider.setContext(mockContext as any);

		serviceProvider['dirty'] = true;
		const collectSpy = sinon.spy(serviceProvider, 'collectRegistrations' as any);
		await serviceProvider.refresh();

		sinon.assert.calledOnce(collectSpy);
		collectSpy.restore();
	});

	test('refresh skips collect if not dirty', async () => {
		const mockContext = { workspaceState: { get: sinon.stub().returns(undefined), update: sinon.stub() }, globalState: { get: sinon.stub().returns(undefined) } };
		serviceProvider.setContext(mockContext as any);

		const collectSpy = sinon.spy(serviceProvider, 'collectRegistrations' as any);
		await serviceProvider.refresh();

		sinon.assert.notCalled(collectSpy);
		collectSpy.restore();
	});

	test('getServicesForLifetime filters correctly', () => {
		const mockServices = [
			{
				name: 'TestService',
				registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'Test', implementationType: 'TestImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				conflicts: [],
				injectionSites: [{ filePath: '', lineNumber: 1, className: 'TestClass', memberName: 'ctor', type: 'constructor', serviceType: 'Test', linkedRegistrationIds: [] }]
			},
			{
				name: 'OtherService',
				registrations: [{ id: '2', lifetime: Lifetime.Scoped, serviceType: 'Other', implementationType: 'OtherImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				conflicts: [],
				injectionSites: []
			}
		];
		(serviceProvider as any).allServices = mockServices;

		const singletonServices = serviceProvider.getServicesForLifetime(Lifetime.Singleton);
		assert.strictEqual(singletonServices.length, 1);
		assert.strictEqual(singletonServices[0].name, 'TestService');

		const scopedServices = serviceProvider.getServicesForLifetime(Lifetime.Scoped);
		assert.strictEqual(scopedServices.length, 1);
		assert.strictEqual(scopedServices[0].name, 'OtherService');
	});

	test('getServiceGroups computes counts correctly', () => {
		const mockServices = [
			{
				name: 'SingletonService',
				registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'S', implementationType: 'SImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				conflicts: [],
				injectionSites: []
			},
			{
				name: 'ScopedService',
				registrations: [{ id: '2', lifetime: Lifetime.Scoped, serviceType: 'Sc', implementationType: 'ScImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				conflicts: [],
				injectionSites: []
			}
		];
		(serviceProvider as any).allServices = mockServices;

		const groups = serviceProvider.getServiceGroups();
		const singletonGroup = groups.find(g => g.lifetime === Lifetime.Singleton)!;
		const scopedGroup = groups.find(g => g.lifetime === Lifetime.Scoped)!;

		assert.strictEqual(singletonGroup.count, 1);
		assert.strictEqual(scopedGroup.count, 1);
		assert.strictEqual(singletonGroup.services.length, 0); // Lazy
	});
});

suite('Extension Debounce Test', () => {
	test('debounce function batches calls correctly', (done) => {
		const mockUpdate = sinon.stub();
		setTimeout(() => {
			assert.strictEqual(mockUpdate.callCount, 1);
			done();
		}, 150);
	});
});

suite('Commands Tests', () => {
	test('searchServices command works', async () => {
		const mockServices: Service[] = [{
			name: 'TestService',
			registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'TestService', implementationType: 'TestImpl', filePath: '/test/file.cs', lineNumber: 10, methodCall: 'AddSingleton' }],
			injectionSites: [],
			hasConflicts: false,
			conflicts: []
		}];
		sinon.stub(serviceProvider, 'getAllServices').returns(mockServices);

		const quickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves({ label: 'TestService', detail: '1 registrations', service: mockServices[0] } as any);
		const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.searchServices');

		sinon.assert.called(quickPickStub);
		sinon.assert.called(openTextDocumentStub);
		sinon.assert.called(showTextDocumentStub);

		quickPickStub.restore();
		openTextDocumentStub.restore();
		showTextDocumentStub.restore();
	});
});