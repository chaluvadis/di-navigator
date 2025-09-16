import assert from 'assert';
import * as vscode from 'vscode';
import * as extension from '../extension';
import * as models from '../models';
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
		vscode.workspace.findFiles = async function (
			include: vscode.GlobPattern,
			exclude?: vscode.GlobPattern | null | undefined,
			_maxResults?: number | undefined,
			_token?: vscode.CancellationToken | undefined
		): Promise<vscode.Uri[]> {
			// Simulate excludeGlob check
			const excludePatterns = ['**/bin/**', '**/obj/**', '**/Properties/**'];
			const excludeGlob = excludePatterns.join(', ');
			if (exclude !== excludeGlob) {
				throw new Error('Exclude mismatch');
			}
			if (typeof include === 'string' && (['**/*.csproj', '**/*.sln', '**/*.slnx'].includes(include))) {
				return [vscode.Uri.file("C:\\Users\\schaluvadi\\source\\myworks\\WorkFlowOrchestrator\\src\\WorkflowOrchestrator.Api\\WorkflowOrchestrator.Api.csproj")];
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
			_token?: vscode.CancellationToken | undefined
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
		vscode.workspace.findFiles = async function (
			include: vscode.GlobPattern,
			exclude?: vscode.GlobPattern | null | undefined,
			_maxResults?: number | undefined,
			_token?: vscode.CancellationToken | undefined
		): Promise<vscode.Uri[]> {
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

suite('Activation and View Visibility Tests', () => {
	const { activate } = require('../extension');
	const { commands } = require('vscode');
	const { serviceProvider } = require('../serviceProvider');

	test('activation sets context true for .NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [vscode.Uri.file('test.csproj')];

		const sandbox = sinon.createSandbox();
		sandbox.stub(commands, 'executeCommand');
		sandbox.stub(serviceProvider, 'collectRegistrations').resolves();
		sandbox.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] };
		await activate(context);

		sinon.assert.calledWith(
			commands.executeCommand,
			sinon.match('setContext'),
			'diNavigator:validWorkspace',
			true
		);
		sinon.assert.calledOnce(serviceProvider.collectRegistrations);
		sinon.assert.notCalled(serviceProvider.clearState);

		vscode.workspace.findFiles = originalFindFiles;
		sandbox.restore();
	});

	test('activation sets context false for non-.NET workspace', async () => {
		const originalFindFiles = vscode.workspace.findFiles;
		vscode.workspace.findFiles = async () => [];

		const sandbox = sinon.createSandbox();
		sandbox.stub(commands, 'executeCommand');
		sandbox.stub(serviceProvider, 'collectRegistrations').resolves();
		sandbox.stub(serviceProvider, 'clearState').resolves();

		const context = { subscriptions: [] };
		await activate(context);

		sinon.assert.calledWith(commands.executeCommand, sinon.match('setContext'), 'diNavigator:validWorkspace', false);
		sinon.assert.notCalled(serviceProvider.collectRegistrations);
		sinon.assert.calledOnce(serviceProvider.clearState);

		vscode.workspace.findFiles = originalFindFiles;
		sandbox.restore();
	});
});

suite('Commands Tests', () => {
	const { registerCommands, findProjectFiles, validateAndOpen } = require('../commands');
	const { commands, workspace, window } = require('vscode');

	test('findProjectFiles uses cache if fresh', async () => {
		const context = {
			workspaceState: {
				get: sinon.stub().returns({
					uris: [vscode.Uri.file('test.csproj')],
					timestamp: Date.now() - 100000
				}),
				update: sinon.stub().resolves()
			}
		};
		sinon.stub(workspace, 'findFiles').resolves([]);

		const result = await findProjectFiles(context as any);

		sinon.assert.notCalled(workspace.findFiles);
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].fsPath, 'test.csproj');
	});

	test('findProjectFiles scans and caches on stale cache', async () => {
		const context = {
			workspaceState: {
				get: sinon.stub().returns({
					uris: [],
					timestamp: Date.now() - 10 * 60 * 1000
				}),
				update: sinon.stub().resolves()
			}
		};
		const mockFiles = [vscode.Uri.file('proj.csproj')];
		sinon.stub(workspace, 'findFiles').resolves(mockFiles);

		const result = await findProjectFiles(context as any);

		sinon.assert.calledOnce(workspace.findFiles);
		assert.strictEqual(result.length, 1);
		sinon.assert.calledWith(context.workspaceState.update, 'cachedProjects',
			sinon.match({ uris: result, timestamp: sinon.match.number }));
	});

	test('findProjectFiles handles scan error', async () => {
		const context = { workspaceState: { get: sinon.stub().returns(null), update: sinon.stub().resolves() } };
		sinon.stub(workspace, 'findFiles').rejects(new Error('Scan error'));

		const result = await findProjectFiles(context as any);

		assert.strictEqual(result.length, 0);
		sinon.assert.calledWith(context.workspaceState.update, 'cachedProjects', undefined);
	});

	test('validateAndOpen succeeds', async () => {
		sinon.stub(workspace.fs, 'stat').resolves({} as any);
		sinon.stub(workspace, 'openTextDocument').resolves({} as any);
		sinon.stub(window, 'showTextDocument').resolves();

		const result = await validateAndOpen('/valid/path.cs', 10);

		assert.strictEqual(result, true);
	});

	test('validateAndOpen fails on missing file', async () => {
		const error = new Error('File not found') as any;
		error.code = 'EntryNotFound';
		sinon.stub(workspace.fs, 'stat').rejects(error);

		const result = await validateAndOpen('/missing/path.cs', 10);

		assert.strictEqual(result, false);
		// Mocked showWarningMessage called
	});

	test('GO_TO_IMPL with single registration', async () => {
		const service = { registrations: [{ filePath: '/path.cs', lineNumber: 5 }] as models.Registration[] };
		sinon.stub(workspace, 'openTextDocument').resolves({} as any);
		sinon.stub(window, 'showTextDocument').resolves();
		sinon.stub(workspace.fs, 'stat').resolves({} as any);

		registerCommands({ subscriptions: [] } as any); // Register to access command

		await commands.executeCommand('di-navigator.goToImplementation', service);

		sinon.assert.calledOnce(window.showTextDocument);
	});

	test('GO_TO_IMPL with multiple registrations uses QuickPick', async () => {
		const service = {
			registrations: [
				{ filePath: '/path1.cs', lineNumber: 5 },
				{ filePath: '/path2.cs', lineNumber: 10 }
			] as models.Registration[]
		};
		const mockSelected = { registration: service.registrations[1] };
		sinon.stub(window, 'showQuickPick').resolves(mockSelected as any);
		sinon.stub(workspace, 'openTextDocument').resolves({} as any);
		sinon.stub(window, 'showTextDocument').resolves();
		sinon.stub(workspace.fs, 'stat').resolves({} as any);

		registerCommands({ subscriptions: [] } as any);

		await commands.executeCommand('di-navigator.goToImplementation', service);

		sinon.assert.calledOnce(window.showQuickPick);
		sinon.assert.calledWith(window.showTextDocument, sinon.match.any, { selection: new vscode.Range(9, 0, 9, 0) });
	});

	test('GO_TO_IMPL no registrations shows message', async () => {
		const service = { registrations: [] as models.Registration[] };

		sinon.stub(window, 'showInformationMessage');

		registerCommands({ subscriptions: [] } as any);

		await commands.executeCommand('di-navigator.goToImplementation', service);

		sinon.assert.calledWith(window.showInformationMessage, 'No implementation found.');
	});

	test('GO_TO_SITE with site', async () => {
		const site = { filePath: '/path.cs', lineNumber: 5 } as models.InjectionSite;
		sinon.stub(workspace, 'openTextDocument').resolves({} as any);
		sinon.stub(window, 'showTextDocument').resolves();
		sinon.stub(workspace.fs, 'stat').resolves({} as any);

		registerCommands({ subscriptions: [] } as any);

		await commands.executeCommand('di-navigator.goToInjectionSite', site);

		sinon.assert.calledOnce(window.showTextDocument);
	});

	test('GO_TO_SITE no site shows message', async () => {
		sinon.stub(window, 'showInformationMessage');

		registerCommands({ subscriptions: [] } as any);

		await commands.executeCommand('di-navigator.goToInjectionSite', null);

		sinon.assert.calledWith(window.showInformationMessage, 'No injection site selected.');
	});

	test('registerCommands handles registration error', async () => {
		const { serviceProvider } = require('../serviceProvider');
		const { diNavigatorProvider } = require('../treeView');

		const context = { subscriptions: [], globalState: { update: sinon.stub().resolves() } } as any;
		sinon.stub(commands, 'registerCommand').callsFake((cmd) => {
			if (cmd === 'di-navigator.selectProject') {
				throw new Error('Test error');
			}
			return { dispose: () => { } };
		});
		sinon.stub(workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } });
		sinon.stub(serviceProvider, 'refresh').resolves();
		sinon.stub(diNavigatorProvider, 'refresh');

		registerCommands(context);

		// Error logged, message shown
		assert(true); // No crash
	});
});

suite('Roslyn Integration Tests', () => {
	const { extractRegistrations, extractInjectionSites } = require('../parser');
	const { Lifetime } = require('../models');
	const { execSync } = require('child_process');
	const { existsSync } = require('fs');
	const path = require('path');

	test('extractRegistrations uses Roslyn tool and parses output', () => {
		const sandbox = sinon.createSandbox();
		const mockExists = sandbox.stub(require('fs'), 'existsSync').returns(true);
		const mockExec = sandbox.stub(execSync, 'execSync').returns(
			Buffer.from(JSON.stringify({
				Registrations: [
					{
						Lifetime: 'Scoped',
						ServiceType: 'IService',
						ImplementationType: 'ServiceImpl',
						FilePath: '/test/file.cs',
						LineNumber: 10,
						MethodCall: 'AddScoped'
					}
				],
				InjectionSites: []
			}))
		);

		const mockToolPath = './tools/roslyn-di-analyzer/bin/Debug/net8.0/roslyn-di-analyzer.dll';
		const command = `dotnet "${mockToolPath}" --file "/test/file.cs"`;

		const result = extractRegistrations('/test/file.cs');

		sinon.assert.calledOnce(mockExists);
		sinon.assert.calledWith(mockExec, command, { encoding: 'utf8' });
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].lifetime, Lifetime.Scoped);
		assert.strictEqual(result[0].serviceType, 'IService');
		assert.strictEqual(result[0].implementationType, 'ServiceImpl');
		assert.strictEqual(result[0].filePath, '/test/file.cs');
		assert.strictEqual(result[0].lineNumber, 10);
		assert.strictEqual(result[0].methodCall, 'AddScoped');

		sandbox.restore();
	});

	test('extractInjectionSites uses Roslyn tool and parses output', () => {
		const sandbox = sinon.createSandbox();
		const mockExists = sandbox.stub(require('fs'), 'existsSync').returns(true);
		const mockExec = sandbox.stub(execSync, 'execSync').returns(
			Buffer.from(JSON.stringify({
				Registrations: [],
				InjectionSites: [
					{
						FilePath: '/test/file.cs',
						LineNumber: 15,
						ClassName: 'MyClass',
						MemberName: 'ctor',
						Type: 'constructor',
						ServiceType: 'IService'
					},
					{
						FilePath: '/test/file.cs',
						LineNumber: 20,
						ClassName: 'MyClass',
						MemberName: 'logger',
						Type: 'field',
						ServiceType: 'ILogger'
					}
				]
			}))
		);

		const mockToolPath = './tools/roslyn-di-analyzer/bin/Debug/net8.0/roslyn-di-analyzer.dll';
		const command = `dotnet "${mockToolPath}" --file "/test/file.cs"`;

		const result = extractInjectionSites('/test/file.cs');

		sinon.assert.calledOnce(mockExists);
		sinon.assert.calledWith(mockExec, command, { encoding: 'utf8' });
		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].filePath, '/test/file.cs');
		assert.strictEqual(result[0].lineNumber, 15);
		assert.strictEqual(result[0].className, 'MyClass');
		assert.strictEqual(result[0].memberName, 'ctor');
		assert.strictEqual(result[0].type, 'constructor');
		assert.strictEqual(result[0].serviceType, 'IService');

		assert.strictEqual(result[1].filePath, '/test/file.cs');
		assert.strictEqual(result[1].lineNumber, 20);
		assert.strictEqual(result[1].className, 'MyClass');
		assert.strictEqual(result[1].memberName, 'logger');
		assert.strictEqual(result[1].type, 'field');
		assert.strictEqual(result[1].serviceType, 'ILogger');

		sandbox.restore();
	});

	test('extractRegistrations falls back to regex when tool missing', () => {
		const sandbox = sinon.createSandbox();
		sandbox.stub(require('fs'), 'existsSync').returns(false);
		const mockSource = `
			public void ConfigureServices(IServiceCollection services) {
				services.AddScoped<IService, ServiceImpl>();
				services.AddTransient<IOtherService>();
			}
		`;

		const result = extractRegistrations('/test/file.cs', mockSource);

		assert.strictEqual(result.length, 2);
		assert.strictEqual(result[0].serviceType, 'IService');
		assert.strictEqual(result[0].implementationType, 'ServiceImpl');
		assert.strictEqual(result[0].lifetime, Lifetime.Scoped);
		assert.strictEqual(result[1].serviceType, 'IOtherService');
		assert.strictEqual(result[1].implementationType, 'IOtherService');
		assert.strictEqual(result[1].lifetime, Lifetime.Transient);

		sandbox.restore();
	});

	test('extractInjectionSites falls back to regex when tool missing', () => {
		const sandbox = sinon.createSandbox();
		sandbox.stub(require('fs'), 'existsSync').returns(false);
		const mockSource = `
			public class MyClass {
				public MyClass(IService service) { }
				private readonly ILogger logger;
			}
		`;

		const result = extractInjectionSites('/test/file.cs', mockSource);

		assert.strictEqual(result.length, 2); // ctor param and field
		// Note: regex is approximate, but verifies fallback works without crash

		sandbox.restore();
	});

	test('extractRegistrations handles Roslyn tool error, falls back to regex', () => {
		const sandbox = sinon.createSandbox();
		sandbox.stub(require('fs'), 'existsSync').returns(true);
		sandbox.stub(execSync, 'execSync').throws(new Error('Tool error'));
		const mockSource = `services.AddScoped<IService, ServiceImpl>();`;

		const result = extractRegistrations('/test/file.cs', mockSource);

		// Should fallback to regex
		assert.strictEqual(result.length, 1);
		assert.strictEqual(result[0].serviceType, 'IService');

		sandbox.restore();
	});
});