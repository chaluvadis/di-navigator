import assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../extension';
import * as utils from '../utils';
import sinon, { SinonStub } from 'sinon';
import { serviceProvider } from '../serviceProvider';
import { Lifetime, ProjectDI, Service } from '../models';
import * as Commands from '../commands';
import { parseProject } from '../parser';
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

		const result = await utils.detectNetWorkspace();
		assert.strictEqual(result, true);

		findFilesStub.restore();
		getConfigurationStub.restore();
	});

	test('detectNetWorkspace without .NET files', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([]);

		const result = await utils.detectNetWorkspace();
		assert.strictEqual(result, false);

		findFilesStub.restore();
	});

	test('detectNetWorkspace handles error', async () => {
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').rejects(new Error('Test error'));

		const result = await utils.detectNetWorkspace();
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
		const debounce = utils.debounce(mockUpdate, 100);
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

		const result = await parseProject(mockProjectPath, 'fallbackOnly');
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

		const result = await parseProject(mockProjectPath, 'fallbackOnly');
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

	test('goToInjectionSite navigates to injection site directly', async () => {
		const mockInjectionSite = {
			filePath: '/test/Controller.cs',
			lineNumber: 25,
			className: 'HomeController',
			memberName: 'constructor',
			type: 'constructor',
			serviceType: 'IUserService',
			linkedRegistrationIds: []
		};

		const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.goToInjectionSite', mockInjectionSite);

		sinon.assert.calledWith(openTextDocumentStub, sinon.match.has('fsPath', '/test/Controller.cs'));
		sinon.assert.called(showTextDocumentStub);

		openTextDocumentStub.restore();
		showTextDocumentStub.restore();
	});

	test('goToInjectionSite navigates to injection site from service', async () => {
		const mockService = {
			name: 'UserService',
			registrations: [{ id: '1', lifetime: Lifetime.Singleton, serviceType: 'IUserService', implementationType: 'UserServiceImpl', filePath: '/test/UserService.cs', lineNumber: 10, methodCall: '' }],
			injectionSites: [{
				filePath: '/test/Controller.cs',
				lineNumber: 25,
				className: 'HomeController',
				memberName: 'constructor',
				type: 'constructor',
				serviceType: 'IUserService',
				linkedRegistrationIds: ['1']
			}],
			hasConflicts: false,
			conflicts: []
		};

		const openTextDocumentStub = sinon.stub(vscode.workspace, 'openTextDocument').resolves({} as any);
		const showTextDocumentStub = sinon.stub(vscode.window, 'showTextDocument').resolves();

		const context = { globalState: { update: sinon.stub() }, subscriptions: [] } as any;
		Commands.registerCommands(context);

		await vscode.commands.executeCommand('di-navigator.goToInjectionSite', mockService);

		sinon.assert.calledWith(openTextDocumentStub, sinon.match.has('fsPath', '/test/Controller.cs'));
		sinon.assert.called(showTextDocumentStub);

		openTextDocumentStub.restore();
		showTextDocumentStub.restore();
	});

	test('extractMethodName handles complex method names correctly', () => {
		const jsDiParser = new (require('../jsDiParser').JSDIParser)();

		// Test various method call patterns
		const testCases = [
			{ input: 'builder.Services.AddWorkflowOrchestratorDatabase()', expected: 'AddWorkflowOrchestratorDatabase' },
			{ input: 'services.AddSingleton<IUserService, UserService>()', expected: 'AddSingleton' },
			{ input: 'container.AddScoped<IOrderService>(provider => new OrderService())', expected: 'AddScoped' },
			{ input: 'builder.Services.AddTransient<AdminService>()', expected: 'AddTransient' },
			{ input: 'services.TryAddSingleton<IEmailService, EmailService>()', expected: 'TryAddSingleton' },
			{ input: 'builder.Services.AddHttpClient()', expected: 'AddHttpClient' },
			{ input: 'services.AddControllers()', expected: 'AddControllers' }
		];

		testCases.forEach(({ input, expected }) => {
			const result = (jsDiParser as any).extractMethodName(input);
			assert.strictEqual(result, expected, `Failed for input: ${input}`);
		});
	});

	test('parseProject detects injection sites correctly', async () => {
		const mockProjectPath = '/test/project';
		const mockCsFile = '/test/project/Program.cs';
		const mockContent = `
		using Microsoft.Extensions.DependencyInjection;
		using Microsoft.Extensions.Hosting;

		namespace TestProject;

		public interface IUserService
		{
			string GetUserName();
		}

		public interface IOrderService
		{
			void ProcessOrder(int orderId);
		}

		public class UserService : IUserService
		{
			public string GetUserName() => "Test User";
		}

		public class OrderService : IOrderService
		{
			private readonly IUserService _userService;

			public OrderService(IUserService userService)
			{
				_userService = userService;
			}

			public void ProcessOrder(int orderId)
			{
				Console.WriteLine($"Processing order {orderId} for {_userService.GetUserName()}");
			}
		}

		public class AdminService
		{
			private readonly IOrderService _orderService;

			public AdminService(IOrderService orderService)
			{
				_orderService = orderService;
			}

			public void DoAdminWork()
			{
				_orderService.ProcessOrder(123);
			}
		}

		public class Program
		{
			public static void Main(string[] args)
			{
				var host = Host.CreateDefaultBuilder(args)
					.ConfigureServices((context, services) =>
					{
						services.AddSingleton<IUserService, UserService>();
						services.AddScoped<IOrderService, OrderService>();
						services.AddTransient<AdminService>();
					})
					.Build();

				var adminService = host.Services.GetRequiredService<AdminService>();
				adminService.DoAdminWork();
			}
		}
		`;
		const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(mockContent, 'utf8'));
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(mockCsFile)]);
		const execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('Roslyn not built'));

		const result = await parseProject(mockProjectPath, 'fallbackOnly');
		readFileStub.restore();
		findFilesStub.restore();
		execSyncStub.restore();

		// Should have found registrations
		assert(result.serviceGroups.length > 0, 'Should have found service groups');

		// Should have found injection sites
		const totalInjectionSites = result.serviceGroups.reduce((acc, sg) =>
			acc + sg.services.reduce((sAcc, s) => sAcc + s.injectionSites.length, 0), 0);
		assert(totalInjectionSites > 0, `Should have found injection sites, but found ${totalInjectionSites}`);

		// Check specific injection sites
		const userServiceGroup = result.serviceGroups.find(g => g.lifetime === Lifetime.Singleton);
		assert(userServiceGroup, 'Should have found singleton group');

		const userService = userServiceGroup.services.find(s => s.name === 'IUserService');
		assert(userService, 'Should have found IUserService');

		// Should have injection sites for IUserService (injected in OrderService constructor)
		assert(userService.injectionSites.length > 0, `IUserService should have injection sites, but found ${userService.injectionSites.length}`);

		const injectionSite = userService.injectionSites[0];
		assert(injectionSite.className === 'OrderService', `Injection site className should be OrderService, but was ${injectionSite.className}`);
		assert(injectionSite.memberName === 'constructor', `Injection site memberName should be constructor, but was ${injectionSite.memberName}`);
		assert(injectionSite.serviceType === 'IUserService', `Injection site serviceType should be IUserService, but was ${injectionSite.serviceType}`);
	});

	test('parseProject handles factory lambdas and complex expressions', async () => {
		const mockProjectPath = '/test/project';
		const mockCsFile = '/test/project/CoreServiceRegistration.cs';
		const mockContent = `
		using WorkflowOrchestrator.Core.Data.Interfaces;
		using WorkflowOrchestrator.Core.Interfaces.Scheduling;
		using WorkflowOrchestrator.Core.Services.BackgroundJobs;

		namespace WorkflowOrchestrator.Core;

		public static class CoreServiceRegistration
		{
			public static IServiceCollection AddWorkflowOrchestratorCore(
				this IServiceCollection services,
				IConfiguration configuration
			)
			{
				// Standard registrations
				services.AddSingleton<ISystemClock, SystemClock>();
				services.AddMemoryCache();

				// Database services
				services.AddSingleton<IDatabaseManager, SQLiteDatabaseManager>();
				services.AddScoped<IOrchestratorRepository, SQLiteOrchestratorRepository>();

				// Complex factory registration with GetRequiredService
				services.AddSingleton(sp =>
					sp.GetRequiredService<ISchedulerFactory>().GetScheduler().GetAwaiter().GetResult()
				);

				// Another factory with GetService
				services.AddScoped<IWorkflowScheduler>(provider =>
					new SmartWorkflowScheduler(provider.GetService<IJobSchedulingService>())
				);

				return services;
			}
		}
		`;
		const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(mockContent, 'utf8'));
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(mockCsFile)]);
		const execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('Roslyn not built'));

		const result = await parseProject(mockProjectPath, 'fallbackOnly');
		readFileStub.restore();
		findFilesStub.restore();
		execSyncStub.restore();

		// Should have found registrations
		assert(result.serviceGroups.length > 0, 'Should have found service groups');

		// Should have found injection sites for factory lambdas
		const totalInjectionSites = result.serviceGroups.reduce((acc, sg) =>
			acc + sg.services.reduce((sAcc, s) => sAcc + s.injectionSites.length, 0), 0);
		assert(totalInjectionSites > 0, `Should have found injection sites in factory lambdas, but found ${totalInjectionSites}`);

		// Check for GetRequiredService injection sites
		const schedulerFactoryGroup = result.serviceGroups.find(g => g.lifetime === Lifetime.Singleton);
		assert(schedulerFactoryGroup, 'Should have found singleton group');

		const schedulerFactoryService = schedulerFactoryGroup.services.find(s => s.name === 'ISchedulerFactory');
		assert(schedulerFactoryService, 'Should have found ISchedulerFactory service');

		// Should have injection sites for GetRequiredService usage
		const getRequiredServiceSites = schedulerFactoryService.injectionSites.filter(site =>
			site.memberName === 'GetRequiredService');
		assert(getRequiredServiceSites.length > 0, 'Should have found GetRequiredService injection sites');

		// Check for GetService injection sites
		const jobSchedulingService = schedulerFactoryGroup.services.find(s => s.name === 'IJobSchedulingService');
		if (jobSchedulingService) {
			const getServiceSites = jobSchedulingService.injectionSites.filter(site =>
				site.memberName === 'GetService');
			assert(getServiceSites.length > 0, 'Should have found GetService injection sites');
		}
	});

	test('parseProject handles ASP.NET Core startup code with complex patterns', async () => {
		const mockProjectPath = '/test/project';
		const mockCsFile = '/test/project/Program.cs';
		const mockContent = `
		var builder = WebApplication.CreateBuilder(args);

		// Add services to the container.
		builder.Services.AddControllers();
		builder.Services.AddEndpointsApiExplorer();
		builder.Services.AddOpenApi(options =>
		{
			options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1;
		});

		// Register Core EF DbContext and repositories (includes IWorkflowDefinitionRepository/IWorkflowInstanceRepository)
		builder.Services.AddWorkflowOrchestratorDatabase(builder.Configuration);

		// Register Core services into API's DI container
		builder.Services.AddWorkflowOrchestratorCore(builder.Configuration);

		ConfigureBuilderServices(builder);

		var app = builder.Build();

		// Initialize database (migrations/seed) before orchestrator init
		await app.Services.InitializeDatabaseAsync();

		// Optional: initialize orchestrator (db init, workflow discovery, scheduling)
		try
		{
			using var scope = app.Services.CreateScope();
			var env = scope.ServiceProvider.GetRequiredService<IHostEnvironment>();
			var workflowsDir = Path.Combine(env.ContentRootPath, "workflows");
			await scope.ServiceProvider.InitializeWorkflowOrchestratorAsync(workflowsDir, CancellationToken.None);
		}
		catch (Exception ex)
		{
			app.Logger.LogWarning(ex, "Workflow Orchestrator initialization skipped or failed");
		}

		// Configure the HTTP request pipeline.
		app.UseCors("AllowAll");
		app.UseAuthorization();
		app.MapControllers();

		app.MapOpenApi("/openapi/openapi.json");

		app.Run();

		static void ConfigureBuilderServices(WebApplicationBuilder builder)
		{
			// Add core services
			builder.Services.AddScoped<IWorkflowDefinitionService, WorkflowDefinitionService>();
			builder.Services.AddScoped<IWorkflowExecutionService, WorkflowExecutionService>();
			builder.Services.AddScoped<IWorkflowInstanceManager, WorkflowInstanceManager>();
			// Analytics
			builder.Services.AddScoped<IAnalyticsEngine, AnalyticsEngine>();
			builder.Services.AddScoped<IMetricsCollector, MetricsCollector>();

			// Monitoring services
			builder.Services.AddScoped<SystemMonitoringService>();
			builder.Services.AddScoped<ISystemMonitoringService>(sp => sp.GetRequiredService<SystemMonitoringService>());
			builder.Services.AddScoped<CoreMonitoring.ISystemMonitoringService>(sp => sp.GetRequiredService<SystemMonitoringService>());

			// Notification Engine & repositories
			builder.Services.AddScoped<INotificationEngine, NotificationEngine>();
			builder.Services.AddScoped<IDeliveryTrackingService, EfDeliveryTrackingService>();
			builder.Services.AddScoped<IDeadLetterQueueService, EfDeadLetterQueueService>();

			// Use EF-backed repositories
			builder.Services.AddScoped<INotificationChannelRepository, EfNotificationChannelRepository>();
			builder.Services.AddScoped<INotificationTemplateRepository, EfNotificationTemplateRepository>();

			// Notification Channels
			builder.Services.AddScoped<EmailNotificationChannel>();
			builder.Services.AddScoped<WebhookNotificationChannel>();

			// HttpClient for webhook/email integrations
			builder.Services.AddHttpClient();

			// API-layer notification services
			builder.Services.AddScoped<INotificationService, NotificationService>();
			builder.Services.AddScoped<INotificationChannelService, NotificationChannelService>();
			builder.Services.AddScoped<INotificationTemplateService, NotificationTemplateService>();

			// Add CORS
			builder.Services.AddCors(options =>
			{
				options.AddPolicy(
					"AllowAll",
					policy =>
					{
						policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
					}
				);
			});
		}
		`;
		const readFileStub = sinon.stub(vscode.workspace.fs, 'readFile').resolves(Buffer.from(mockContent, 'utf8'));
		const findFilesStub = sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(mockCsFile)]);
		const execSyncStub = sinon.stub(childProcess, 'execSync').throws(new Error('Roslyn not built'));

		const result = await parseProject(mockProjectPath, 'fallbackOnly');
		readFileStub.restore();
		findFilesStub.restore();
		execSyncStub.restore();

		// Should have found registrations
		assert(result.serviceGroups.length > 0, 'Should have found service groups');

		// Should have found injection sites for complex patterns
		const totalInjectionSites = result.serviceGroups.reduce((acc, sg) =>
			acc + sg.services.reduce((sAcc, s) => sAcc + s.injectionSites.length, 0), 0);
		assert(totalInjectionSites > 0, `Should have found injection sites in ASP.NET Core code, but found ${totalInjectionSites}`);

		// Log the treeview structure for analysis
		console.log('=== TREEVIEW STRUCTURE ANALYSIS ===');
		console.log(`Project: ${result.projectName}`);
		console.log(`Service Groups: ${result.serviceGroups.length}`);

		result.serviceGroups.forEach((group, groupIndex) => {
			console.log(`\n[${groupIndex}] ${group.lifetime} (${group.services.length} services)`);

			group.services.forEach((service, serviceIndex) => {
				console.log(`  [${serviceIndex}] ${service.name} (${service.registrations.length} registrations, ${service.injectionSites.length} injection sites)`);

				// Log injection sites
				service.injectionSites.forEach((site, siteIndex) => {
					console.log(`    - Injection Site [${siteIndex}]: ${site.className}.${site.memberName} (${site.serviceType})`);
				});
			});
		});

		// Verify specific patterns are detected
		const scopedGroup = result.serviceGroups.find(g => g.lifetime === Lifetime.Scoped);
		assert(scopedGroup, 'Should have found scoped group');

		// Should have found GetRequiredService injection sites
		const getRequiredServiceSites = scopedGroup.services.reduce((acc, service) =>
			acc + service.injectionSites.filter(site => site.memberName === 'GetRequiredService').length, 0);
		assert(getRequiredServiceSites > 0, 'Should have found GetRequiredService injection sites');

		// Should have found AddOpenApi injection sites
		const addOpenApiSites = scopedGroup.services.reduce((acc, service) =>
			acc + service.injectionSites.filter(site => site.memberName === 'AddOpenApi').length, 0);
		assert(addOpenApiSites > 0, 'Should have found AddOpenApi injection sites');

		// Should have found AddCors injection sites
		const addCorsSites = scopedGroup.services.reduce((acc, service) =>
			acc + service.injectionSites.filter(site => site.memberName === 'AddCors').length, 0);
		assert(addCorsSites > 0, 'Should have found AddCors injection sites');

		// Should have found service resolution sites
		const serviceResolutionSites = scopedGroup.services.reduce((acc, service) =>
			acc + service.injectionSites.filter(site =>
				site.memberName === 'GetRequiredService' && site.className !== 'UnknownClass').length, 0);
		assert(serviceResolutionSites > 0, 'Should have found service resolution injection sites');
	});
});

suite('Robustness Tests', () => {
});