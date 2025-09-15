import * as assert from 'assert';
import * as vscode from 'vscode';
import { Uri, CancellationToken } from 'vscode';
import * as extension from '../extension';

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
