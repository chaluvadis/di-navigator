import * as assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../extension';
import sinon from 'sinon';
import { serviceProvider } from '../serviceProvider';
import { Lifetime, Service } from '../models';
import * as Commands from '../commands';
import * as parser from '../parser';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('detectNetWorkspace with .NET files', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		const originalGetConfiguration = vscode.workspace.getConfiguration;

		// Mock getConfiguration to return exclude patterns
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

		// Mock findFiles to return a csproj file
		vscode.workspace.findFiles = async (
			include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => {
			const includeStr = typeof include === 'string' ? include : (
				include as vscode.RelativePattern).pattern;
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
		vscode.workspace.findFiles = async (
			_include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => [];

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
	});

	test('detectNetWorkspace handles error', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async (
			_include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => {
			throw new Error('Test error');
		};

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
	});

	test('activation sets context true for .NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async (
			_include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => [vscode.Uri.file('test.csproj')];

		let registerCommands = sinon.stub().callsFake(() => { });
		const originalRegisterCommands = registerCommands;

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		registerCommands = originalRegisterCommands;

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
		vscode.workspace.findFiles = async (
			_include: vscode.GlobPattern,
			_exclude?: vscode.GlobPattern | null,
			_maxResults?: number,
			_token?: vscode.CancellationToken
		) => [];

		let registerCommands = sinon.stub().callsFake(() => { });
		const originalRegisterCommands = registerCommands;

		const setContextStub = sinon.stub(vscode.commands, 'executeCommand');
		const refreshStub = sinon.stub(serviceProvider, 'refresh').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] } as any;
		await extension.activate(context);

		registerCommands = originalRegisterCommands;

		sinon.assert.calledWith(setContextStub, 'setContext', 'diNavigator:validWorkspace', false);
		sinon.assert.notCalled(refreshStub);
		sinon.assert.calledOnce(clearStub);

		vscode.workspace.findFiles = originalFindFiles;
		setContextStub.restore();
		refreshStub.restore();
		clearStub.restore();
	});

	afterEach(() => {
		sinon.restore();
	});

	afterEach(() => {
		sinon.restore();
	});
});

suite('Parser Helpers Tests', () => {
	test('isServicesChain identifies services identifier', () => {
		const node = { type: 'identifier', text: 'services' };
		assert.strictEqual(parser.isServicesChain(node), true);
	});

	test('isServicesChain does not identify non-services', () => {
		const node = { type: 'identifier', text: 'other' };
		assert.strictEqual(parser.isServicesChain(node), false);
	});

	test('isServicesChain identifies member access to services', () => {
		const nameNode = { type: 'identifier', text: 'AddScoped' };
		const functionNode = {
			type: 'member_access_expression',
			childForFieldName: (field: string) => field === 'name' ? nameNode : { type: 'identifier', text: 'services' }
		};
		assert.strictEqual(parser.isServicesChain(functionNode), true);
	});

	test('isValidDIMethod detects AddSingleton', () => {
		assert.strictEqual(parser.isValidDIMethod('AddSingleton'), true);
		assert.strictEqual(parser.isValidDIMethod('AddScoped'), true);
		assert.strictEqual(parser.isValidDIMethod('AddTransient'), true);
		assert.strictEqual(parser.isValidDIMethod('AddSomethingElse'), false);
	});

	test('getLifetimeFromMethod returns correct lifetime', () => {
		assert.strictEqual(parser.getLifetimeFromMethod('AddSingleton'), Lifetime.Singleton);
		assert.strictEqual(parser.getLifetimeFromMethod('AddScoped'), Lifetime.Scoped);
		assert.strictEqual(parser.getLifetimeFromMethod('AddTransient'), Lifetime.Transient);
	});

	test('extractTypeArguments handles two args', () => {
		const nameNode = {
			childForFieldName: (field: string) => field === 'type_arguments' ? {
				type: 'type_argument_list',
				namedChildren: [{ text: 'IService' }, { text: 'Service' }]
			} : null
		};
		const result = parser.extractTypeArguments(nameNode);
		assert.strictEqual(result.serviceType, 'IService');
		assert.strictEqual(result.implType, 'Service');
	});

	test('extractTypeArguments handles single arg self-registration', () => {
		const nameNode = {
			childForFieldName: (field: string) => field === 'type_arguments' ? {
				type: 'type_argument_list',
				namedChildren: [{ text: 'Service' }]
			} : null
		};
		const result = parser.extractTypeArguments(nameNode);
		assert.strictEqual(result.serviceType, 'Service');
		assert.strictEqual(result.implType, 'Service');
	});

	test('extractTypeArguments handles no args', () => {
		const nameNode = { childForFieldName: () => null };
		const result = parser.extractTypeArguments(nameNode);
		assert.strictEqual(result.serviceType, 'Unknown');
		assert.strictEqual(result.implType, 'Unknown');
	});

	test('extractImplFromArguments handles new_expression', () => {
		const argList = {
			namedChildren: [{
				type: 'argument',
				namedChildren: [{
					type: 'new_expression',
					childForFieldName: (field: string) => field === 'constructor' ? { type: 'simple_type', text: 'MyService' } : null
				}]
			}]
		};
		const result = parser.extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'MyService');
	});

	test('extractImplFromArguments handles lambda factory', () => {
		const argList = {
			namedChildren: [{
				type: 'argument',
				namedChildren: [{ type: 'lambda_expression' }]
			}]
		};
		const result = parser.extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'Factory');
	});

	test('extractImplFromArguments handles identifier reference', () => {
		const argList = {
			namedChildren: [{
				type: 'argument',
				namedChildren: [{ type: 'identifier', text: 'someService' }]
			}]
		};
		const result = parser.extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'someService');
	});

	test('extractImplFromArguments falls back to serviceType', () => {
		const argList = { namedChildren: [] };
		const result = parser.extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'IService');
	});

	test('extractConstructorInjectionSites extracts params', () => {
		const constructorNode = {
			childForFieldName: (field: string) => field === 'parameters' ? {
				type: 'parameter_list',
				namedChildren: [{
					type: 'parameter',
					childForFieldName: (f: string) => f === 'type' ? { type: 'simple_type', text: 'IService' } : null,
					startPosition: { row: 10 }
				}]
			} : null,
			text: 'ctor'
		};
		const sites = parser.extractConstructorInjectionSites(constructorNode, 'MyClass', '/path/to/file.cs');
		assert.strictEqual(sites.length, 1);
		assert.strictEqual(sites[0].serviceType, 'IService');
		assert.strictEqual(sites[0].lineNumber, 11);
		assert.strictEqual(sites[0].className, 'MyClass');
		assert.strictEqual(sites[0].memberName, 'ctor');
	});

	test('extractConstructorInjectionSites handles no params', () => {
		const constructorNode = { childForFieldName: () => null, text: 'ctor' };
		const sites = parser.extractConstructorInjectionSites(constructorNode, 'MyClass', '/path/to/file.cs');
		assert.strictEqual(sites.length, 0);
	});
});

suite('ServiceProvider Tests', () => {
	test('refresh uses cache if recent', async () => {
		const mockContext = {
			workspaceState: {
				get: sinon.stub().returns({ data: [{ name: 'TestService', registrations: [], injectionSites: [], hasConflicts: false }], timestamp: Date.now() - 100000 }),
				update: sinon.stub()
			},
			globalState: { get: sinon.stub().returns(undefined) }
		};
		serviceProvider.setContext(mockContext as any);

		const collectSpy = sinon.spy(serviceProvider, 'collectRegistrations' as any);
		await serviceProvider.refresh();

		sinon.assert.notCalled(collectSpy);
		collectSpy.restore();
	});

	test('refresh forces collect if dirty', async () => {
		const mockContext = {
			workspaceState: {
				get: sinon.stub().returns(undefined),
				update: sinon.stub()
			},
			globalState: { get: sinon.stub().returns(undefined) }
		};
		serviceProvider.setContext(mockContext as any);

		serviceProvider.invalidateFile('test.cs');
		const collectSpy = sinon.spy(serviceProvider, 'collectRegistrations' as any);
		await serviceProvider.refresh();

		sinon.assert.calledOnce(collectSpy);
		collectSpy.restore();
	});

	test('getServicesForLifetime filters correctly', () => {
		const mockServices = [
			{
				name: 'TestService',
				registrations: [{ lifetime: Lifetime.Singleton, serviceType: 'Test', implementationType: 'TestImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				injectionSites: []
			},
			{
				name: 'OtherService',
				registrations: [{ lifetime: Lifetime.Scoped, serviceType: 'Other', implementationType: 'OtherImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
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

	test('buildGraphAndConflicts detects unused services', () => {
		const mockServicesByName = new Map();
		const usedService: Service = {
			name: 'Used',
			registrations: [{ lifetime: Lifetime.Singleton, serviceType: 'Used', implementationType: 'UsedImpl', filePath: '', lineNumber: 1, methodCall: '' }],
			hasConflicts: false,
			conflicts: [],
			injectionSites: [{ filePath: '', lineNumber: 1, className: 'TestClass', memberName: 'ctor', type: 'constructor', serviceType: 'Used' }]
		};
		const unusedService: Service = {
			name: 'Unused',
			registrations: [{ lifetime: Lifetime.Singleton, serviceType: 'Unused', implementationType: 'UnusedImpl', filePath: '', lineNumber: 1, methodCall: '' }],
			hasConflicts: false,
			conflicts: [],
			injectionSites: []
		};
		mockServicesByName.set('Used', usedService);
		mockServicesByName.set('Unused', unusedService);

		serviceProvider.buildGraphAndConflicts(mockServicesByName);

		assert.strictEqual(unusedService.hasConflicts, true);
		assert.strictEqual(unusedService.conflicts!.length, 1);
		assert.strictEqual(unusedService.conflicts![0].type, 'Unused');
		assert.strictEqual(usedService.hasConflicts, false);
	});

	test('getServiceGroups computes counts correctly', () => {
		const mockServices = [
			{
				name: 'SingletonService',
				registrations: [{ lifetime: Lifetime.Singleton, serviceType: 'S', implementationType: 'SImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
				injectionSites: []
			},
			{
				name: 'ScopedService',
				registrations: [{ lifetime: Lifetime.Scoped, serviceType: 'Sc', implementationType: 'ScImpl', filePath: '', lineNumber: 1, methodCall: '' }],
				hasConflicts: false,
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

suite('Commands Tests', () => {
	test('searchServices command works', async () => {
		const mockServices: Service[] = [{
			name: 'TestService',
			registrations: [{ lifetime: Lifetime.Singleton, serviceType: 'TestService', implementationType: 'TestImpl', filePath: '/test/file.cs', lineNumber: 10, methodCall: 'AddSingleton' }],
			injectionSites: [],
			hasConflicts: false,
			conflicts: []
		}];
		sinon.stub(serviceProvider, 'getAllServices').returns(mockServices);

		const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand')
			.callsFake((_command: string, _callback?: any) => ({
				dispose: sinon.stub()
			} as any));

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