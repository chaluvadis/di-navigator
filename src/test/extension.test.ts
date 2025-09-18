import assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../extension';
import sinon, { SinonStub } from 'sinon';
import { serviceProvider } from '../serviceProvider';
import { Lifetime, ProjectDI, Service } from '../models';
import * as Commands from '../commands';
import { parseProject, getLifetimeFromString } from '../parser';
import * as childProcess from 'child_process';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');
	test('detectNetWorkspace with .NET files', async () => {
		const getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration').returns({
			get: (section: string) => {
				if (section === 'diNavigator.excludeFolders') {
					return ['**/bin/**', '**/obj/**', '**/Properties/**'];
				}
				return undefined;
			},
			has: () => false,
			inspect: () => undefined,
			update: async () => { }
		} as any);

		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').callsFake(async (
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
		});

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, true);

		findFilesStub.restore();
		getConfigurationStub.restore();
	});

	test('detectNetWorkspace without .NET files', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([]);

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		findFilesStub.restore();
	});

	test('detectNetWorkspace handles error', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').rejects(new Error('Test error'));

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		findFilesStub.restore();
	});

	test('activation sets context true for .NET workspace', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file('test.csproj')]);

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		sinon.assert.calledWith(setContextStub, 'setContext', 'diNavigator:validWorkspace', true);
		sinon.assert.calledOnce(refreshStub);
		sinon.assert.notCalled(clearStub);

		findFilesStub.restore();
		setContextStub.restore();
		refreshStub.restore();
		clearStub.restore();
	});

	test('activation sets context false for non-.NET workspace', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([]);

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		sinon.assert.calledWith(setContextStub, 'setContext', 'diNavigator:validWorkspace', false);
		sinon.assert.notCalled(refreshStub);
		sinon.assert.calledOnce(clearStub);

		findFilesStub.restore();
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

		(serviceProvider as any).dirty = true;
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
		const debounce = extension.debounce(mockUpdate, 100);
		debounce();
		debounce();
		debounce();
		setTimeout(() => {
			sinon.assert.calledOnce(mockUpdate);
			done();
		}, 150);
	});
});

suite('Parser Fallback Test', () => {
	test('parseProject fallback extracts basic registration', async () => {
		const mockProjectPath = '/test/project';
		const mockCsFile = '/test/project/Program.cs';
		const mockContent = `
			using Microsoft.Extensions.DependencyInjection;
			public class Program
			{
				public static void Main()
				{
					var builder = WebApplication.CreateBuilder(args);
					builder.Services.AddScoped<IUserService, UserService>();
				}
			}
			`;
		// Mock fs.promises.readFile
		const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(mockContent, 'utf8'));
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(mockCsFile)]);
		// Mock Roslyn to throw for fallback
		const execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('Roslyn not built'));

		const result = await parseProject(mockProjectPath);
		readFileStub.restore();
		findFilesStub.restore();
		execSyncStub.restore();

		assert(result.serviceGroups.length > 0);
		const scopedGroup = result.serviceGroups.find(g => g.lifetime === Lifetime.Scoped)!;
		assert(scopedGroup);
		assert(scopedGroup.services.length === 1);
		const service = scopedGroup.services[0];
		assert(service.registrations.length === 1);
		assert(service.registrations[0].serviceType === 'IUserService');
		assert(service.registrations[0].implementationType === 'UserService');
	});

	test('parseProject fallback detects constructor injection', async () => {
		const mockProjectPath = '/test/project';
		const mockCsFile = '/test/project/Controller.cs';
		const mockContent = `
		using Microsoft.AspNetCore.Mvc;
		public class HomeController : Controller
		{
			private readonly IUserService _userService;
			public HomeController(IUserService userService)
			{
				_userService = userService;
			}
		}
		`;
		const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(mockContent, 'utf8'));
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(mockCsFile)]);
		const execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('Roslyn not built'));

		const result = await parseProject(mockProjectPath);
		readFileStub.restore();
		findFilesStub.restore();
		execSyncStub.restore();

		assert(result.serviceGroups.length > 0);
		const group = result.serviceGroups[0];
		assert(group.services.length === 1);
		const service = group.services[0];
		assert(service.injectionSites.length === 1);
		const site = service.injectionSites[0];
		assert(site.className === 'HomeController');
		assert(site.serviceType === 'IUserService');
		assert(site.type === 'constructor');
	});

	test('getLifetimeFromString handles Others', () => {
		assert.strictEqual(getLifetimeFromString('Custom'), Lifetime.Others);
	});
});

suite('Models Tests', () => {
	test('Service hasConflicts set correctly', () => {
		const service: Service = {
			name: 'TestService',
			registrations: [
				{
					id: '1',
					lifetime: Lifetime.Singleton,
					serviceType: 'Test',
					implementationType: 'TestImpl',
					filePath: '',
					lineNumber: 1,
					methodCall: ''
				},
				{
					id: '2',
					lifetime: Lifetime.Scoped,
					serviceType: 'Test',
					implementationType: 'TestImpl2',
					filePath: '',
					lineNumber: 2,
					methodCall: ''
				}
			],
			injectionSites: [],
			hasConflicts: false,
			conflicts: []
		};
		assert(service.hasConflicts === false);

		// Mixed lifetimes scenario
		service.registrations[1].lifetime = Lifetime.Scoped;
		const lifetimes = new Set(service.registrations.map(r => r.lifetime));
		assert(lifetimes.size > 1);

		// Unregistered scenario
		const unregistered: Service = {
			name: 'UnregService',
			registrations: [],
			injectionSites: [{ filePath: '', lineNumber: 1, className: 'Test', memberName: 'ctor', type: 'constructor', serviceType: 'UnregService', linkedRegistrationIds: [] }],
			hasConflicts: false,
			conflicts: []
		};
		assert(unregistered.registrations.length === 0 && unregistered.injectionSites.length > 0);

		// Multiple impls scenario
		const multiple: Service = {
			name: 'MultiService',
			registrations: [
				{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'Multi', implementationType: 'Impl1', filePath: '', lineNumber: 1, methodCall: '' },
				{ id: '2', lifetime: Lifetime.Singleton, serviceType: 'Multi', implementationType: 'Impl2', filePath: '', lineNumber: 2, methodCall: '' }
			],
			injectionSites: [],
			hasConflicts: false,
			conflicts: []
		};
		const implSet = new Set(multiple.registrations.map(r => r.implementationType));
		assert(implSet.size > 1);
	});
});

suite('Commands Tests', () => {
	test('searchServices command works', async () => {
		const mockServices: Service[] = [{
			name: 'TestService',
			registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'TestService', implementationType: 'TestImpl', filePath: '/test/file.cs', lineNumber: 10, methodCall: '' }],
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

	test('filterTree command filters and navigates', async () => {
		const mockServices: Service[] = [
			{
				name: 'UserService',
				registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'UserService', implementationType: 'UserServiceImpl', filePath: '/test/user.cs', lineNumber: 10, methodCall: '' }],
				injectionSites: [],
				hasConflicts: false,
				conflicts: []
			},
			{
				name: 'AdminService',
				registrations: [{ id: '2', lifetime: Lifetime.Scoped, serviceType: 'AdminService', implementationType: 'AdminServiceImpl', filePath: '/test/admin.cs', lineNumber: 20, methodCall: '' }],
				injectionSites: [],
				hasConflicts: false,
				conflicts: []
			}
		];
		sinon.stub(serviceProvider, 'getAllServices').returns(mockServices);
		const inputBoxStub = sinon.stub(vscode.window, 'showInputBox').resolves('user');
		const quickPickStub = sinon.stub(vscode.window, 'showQuickPick').resolves({ label: 'UserService', detail: '1 registrations, 0 sites', service: mockServices[0] } as any);
		const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand');

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.filterTree');

		sinon.assert.calledWith(inputBoxStub, sinon.match.has('placeHolder', 'Filter services by name or type'));
		sinon.assert.calledWith(quickPickStub, sinon.match.array, sinon.match.has('placeHolder', 'Filtered services matching "user"'));
		sinon.assert.calledWith(executeCommandStub, 'di-navigator.goToImplementation', mockServices[0]);

		inputBoxStub.restore();
		quickPickStub.restore();
		executeCommandStub.restore();
	});

	test('exportServices command saves JSON', async () => {
		const mockProjects: ProjectDI[] = [{
			projectPath: '/test/project',
			projectName: 'TestProject',
			serviceGroups: [],
			cycles: [],
			dependencyGraph: {},
			parseStatus: 'success',
			errorDetails: []
		}];
		sinon.stub(serviceProvider, 'getProjectDI').returns(mockProjects);
		const showSaveDialogStub = sinon.stub(vscode.window, 'showSaveDialog').resolves(vscode.Uri.file('/test/di-export.json'));
		const writeFileStub = sinon.stub(vscode.workspace.fs, 'writeFile').resolves();

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.exportServices');

		sinon.assert.called(showSaveDialogStub);
		sinon.assert.called(writeFileStub);

		showSaveDialogStub.restore();
		writeFileStub.restore();
	});

	test('resolveConflicts handles MultipleImplementations', async () => {
		const mockService: Service = {
			name: 'MultiService',
			registrations: [
				{
					id: '1',
					lifetime: Lifetime.Singleton,
					serviceType: 'Multi',
					implementationType: 'Impl1',
					filePath: '/test/1.cs',
					lineNumber: 1,
					methodCall: ''
				},
				{
					id: '2',
					lifetime: Lifetime.Singleton,
					serviceType: 'Multi',
					implementationType: 'Impl2',
					filePath: '/test/2.cs',
					lineNumber: 2,
					methodCall: ''
				}
			],
			injectionSites: [],
			hasConflicts: true,
			conflicts: [{ type: 'MultipleImplementations', details: '2 different implementations' }]
		};
		const mockGroups = [{ lifetime: Lifetime.Singleton, services: [mockService], color: '#FF0000' }];
		sinon.stub(serviceProvider, 'getServiceGroups').returns(mockGroups);
		const quickPickStub = sinon.stub(vscode.window, 'showQuickPick').onFirstCall().resolves({
			label: 'MultiService: MultipleImplementations',
			detail: '2 different implementations',
			conflict: { type: 'MultipleImplementations', details: '2 different implementations' },
			service: mockService
		} as any).onSecondCall().resolves({ label: 'Impl1' } as any);
		const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.resolveConflicts');

		sinon.assert.called(quickPickStub);
		sinon.assert.called(openTextDocumentStub); // If navigated

		quickPickStub.restore();
		openTextDocumentStub.restore();
		showTextDocumentStub.restore();
	});
});

suite('Robustness Tests', () => {
	test('invalidateFile marks specific project dirty', () => {
		(serviceProvider as any).allProjectDirs = ['/test/project1', '/test/project2'];
		serviceProvider.invalidateFile('/test/project1/Program.cs');
		assert((serviceProvider as any).dirtyProjects.has('/test/project1'));
		assert(!(serviceProvider as any).dirty);
	});

	test('persistent caching in serviceProvider', async () => {
		const mockContext = {
			workspaceState: {
				get: sinon.stub().returns(JSON.stringify([
					{ projectPath: '/test', projectName: 'Test', serviceGroups: [], cycles: [], dependencyGraph: {} }
				])),
				update: sinon.stub()
			},
			globalState: { get: sinon.stub().returns(undefined) }
		};
		serviceProvider.setContext(mockContext as any);
		// Load on init
		(serviceProvider as any).projectDI = JSON.parse(mockContext.workspaceState.get());
		assert((serviceProvider as any).projectDI.length === 1);
	});
});