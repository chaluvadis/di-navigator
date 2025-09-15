import assert from 'assert';
import * as vscode from 'vscode';
import { Uri, CancellationToken } from 'vscode';
import * as extension from '../extension';
import sinon from 'sinon';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('detectNetWorkspace with .NET files', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		const originalGetConfiguration = vscode.workspace.getConfiguration;

		// Mock getConfiguration to return exclude patterns
		vscode.workspace.getConfiguration = function (): vscode.WorkspaceConfiguration {
			return {
				get: function <T>(section: string): T | undefined {
					if (section === 'diNavigator.excludeFolders') {
						return ['**/bin/**', '**/obj/**', '**/Properties/**'] as T;
					}
					return undefined;
				},
				has: function (): boolean { return false; },
				inspect: function (): any { return undefined; },
				update: async function (): Promise<void> { return; }
			};
		};

		// Mock findFiles to return a csproj file
		vscode.workspace.findFiles = async function (include: vscode.GlobPattern, exclude?: vscode.GlobPattern | null | undefined, _maxResults?: number | undefined, _token?: CancellationToken | undefined): Promise<vscode.Uri[]> {
			// Simulate excludeGlob check
			const excludePatterns = ['**/bin/**', '**/obj/**', '**/Properties/**'];
			const excludeGlob = excludePatterns.join(', ');
			if (exclude !== excludeGlob) {
				throw new Error('Exclude mismatch');
			}
			if (typeof include === 'string' && (include === '**/*.csproj' || include === '**/*.sln' || include === '**/*.slnx')) {
				return [Uri.file("C:\\Users\\schaluvadi\\source\\myworks\\WorkFlowOrchestrator\\src\\WorkflowOrchestrator.Api\\WorkflowOrchestrator.Api.csproj")];
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
		const originalGetConfiguration = vscode.workspace.getConfiguration;

		// Mock getConfiguration
		vscode.workspace.getConfiguration = function (): vscode.WorkspaceConfiguration {
			return {
				get: function <T>(section: string): T | undefined {
					section;
					return undefined;
				},
				has: function (): boolean { return false; },
				inspect: function (): any { return undefined; },
				update: async function (): Promise<void> { return; }
			};
		};

		// Mock findFiles to return empty
		vscode.workspace.findFiles = async function (
			include: vscode.GlobPattern,
			exclude?: vscode.GlobPattern | null | undefined,
			_maxResults?: number | undefined,
			_token?: CancellationToken | undefined
		): Promise<vscode.Uri[]> {
			include;
			exclude;
			return [];
		};

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
		vscode.workspace.getConfiguration = originalGetConfiguration;
	});

	test('detectNetWorkspace handles error', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		const originalGetConfiguration = vscode.workspace.getConfiguration;

		// Mock getConfiguration
		vscode.workspace.getConfiguration = function (): vscode.WorkspaceConfiguration {
			return {
				get: function <T>(section: string): T | undefined {
					section;
					return undefined;
				},
				has: function (): boolean { return false; },
				inspect: function (): any { return undefined; },
				update: async function (): Promise<void> { return; }
			};
		};

		// Mock findFiles to throw error
		vscode.workspace.findFiles = async function (include: vscode.GlobPattern, exclude?: vscode.GlobPattern | null | undefined, _maxResults?: number | undefined, _token?: CancellationToken | undefined): Promise<vscode.Uri[]> {
			include;
			exclude;
			throw new Error('Test error');
		};

		const result = await extension.detectNetWorkspace();
		assert.strictEqual(result, false);

		vscode.workspace.findFiles = originalFindFiles;
		vscode.workspace.getConfiguration = originalGetConfiguration;
	});
});
suite('Parser Helpers Tests', () => {
	const { isServicesChain, isValidDIMethod,
		getLifetimeFromMethod,
		extractTypeArguments, extractImplFromArguments,
		extractConstructorInjectionSites } = require('../parser');
	const { Lifetime } = require('../models');

	test('isServicesChain identifies services identifier', () => {
		const node = { type: 'identifier', text: 'services' };
		assert.strictEqual(isServicesChain(node), true);
	});

	test('isServicesChain does not identify non-services', () => {
		const node = { type: 'identifier', text: 'other' };
		assert.strictEqual(isServicesChain(node), false);
	});

	test('isServicesChain identifies member access to services', () => {
		const nameNode = { type: 'identifier', text: 'AddScoped' };
		const functionNode = {
			type: 'member_access_expression',
			childForFieldName: (field: string) => field === 'name' ? nameNode : { type: 'identifier', text: 'services' }
		};
		assert.strictEqual(isServicesChain(functionNode), true);
	});

	test('isValidDIMethod detects AddSingleton', () => {
		assert.strictEqual(isValidDIMethod('AddSingleton'), true);
		assert.strictEqual(isValidDIMethod('AddScoped'), true);
		assert.strictEqual(isValidDIMethod('AddTransient'), true);
		assert.strictEqual(isValidDIMethod('AddSomethingElse'), false);
	});

	test('getLifetimeFromMethod returns correct lifetime', () => {
		assert.strictEqual(getLifetimeFromMethod('AddSingleton'), Lifetime.Singleton);
		assert.strictEqual(getLifetimeFromMethod('AddScoped'), Lifetime.Scoped);
		assert.strictEqual(getLifetimeFromMethod('AddTransient'), Lifetime.Transient);
	});

	test('extractTypeArguments handles two args', () => {
		const nameNode = {
			childForFieldName: (field: string) => field === 'type_arguments' ? {
				type: 'type_argument_list',
				namedChildren: [{ text: 'IService' }, { text: 'Service' }]
			} : null
		};
		const result = extractTypeArguments(nameNode);
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
		const result = extractTypeArguments(nameNode);
		assert.strictEqual(result.serviceType, 'Service');
		assert.strictEqual(result.implType, 'Service');
	});

	test('extractTypeArguments handles no args', () => {
		const nameNode = { childForFieldName: () => null };
		const result = extractTypeArguments(nameNode);
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
		const result = extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'MyService');
	});

	test('extractImplFromArguments handles lambda factory', () => {
		const argList = {
			namedChildren: [{
				type: 'argument',
				namedChildren: [{ type: 'lambda_expression' }]
			}]
		};
		const result = extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'Factory');
	});

	test('extractImplFromArguments handles identifier reference', () => {
		const argList = {
			namedChildren: [{
				type: 'argument',
				namedChildren: [{ type: 'identifier', text: 'someService' }]
			}]
		};
		const result = extractImplFromArguments(argList, 'IService');
		assert.strictEqual(result, 'someService');
	});

	test('extractImplFromArguments falls back to serviceType', () => {
		const argList = { namedChildren: [] };
		const result = extractImplFromArguments(argList, 'IService');
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
		const sites = extractConstructorInjectionSites(constructorNode, 'MyClass', '/path/to/file.cs');
		assert.strictEqual(sites.length, 1);
		assert.strictEqual(sites[0].serviceType, 'IService');
		assert.strictEqual(sites[0].lineNumber, 11);
		assert.strictEqual(sites[0].className, 'MyClass');
		assert.strictEqual(sites[0].memberName, 'ctor');
	});

	test('extractConstructorInjectionSites handles no params', () => {
		const constructorNode = { childForFieldName: () => null, text: 'ctor' };
		const sites = extractConstructorInjectionSites(constructorNode, 'MyClass', '/path/to/file.cs');
		assert.strictEqual(sites.length, 0);
	});
});

suite('Activation and View Visibility Tests', () => {
	const { activate } = require('../extension');
	const { commands } = require('vscode');
	const { serviceProvider } = require('../serviceProvider');

	test('activation sets context true for .NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [vscode.Uri.file('test.csproj')];

		const setContextStub = sinon.stub(commands, 'executeCommand');
		const collectStub = sinon.stub(serviceProvider, 'collectRegistrations').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] };
		await activate(context);

		sinon.assert.calledWith(setContextStub, sinon.match('setContext'), 'diNavigator:validWorkspace', true);
		sinon.assert.calledOnce(collectStub);
		sinon.assert.notCalled(clearStub);

		vscode.workspace.findFiles = originalFindFiles;
		setContextStub.restore();
		collectStub.restore();
		clearStub.restore();
	});

	test('activation sets context false for non-.NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [];

		const setContextStub = sinon.stub(commands, 'executeCommand');
		const collectStub = sinon.stub(serviceProvider, 'collectRegistrations').resolves();
		const clearStub = sinon.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] };
		await activate(context);

		sinon.assert.calledWith(setContextStub, sinon.match('setContext'), 'diNavigator:validWorkspace', false);
		sinon.assert.notCalled(collectStub);
		sinon.assert.calledOnce(clearStub);

		vscode.workspace.findFiles = originalFindFiles;
		setContextStub.restore();
		collectStub.restore();
		clearStub.restore();
	});
});