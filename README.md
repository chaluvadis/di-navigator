# DI & Service Navigator

*Visualize and explore Dependency Injection registrations and injection sites in your C# projects.*

---

## Table of Contents

- [Overview](#overview)  
- [Features](#features)  
- [Installation](#installation)  
- [Usage](#usage)  
- [Technical Details](#technical-details)  
- [Prerequisites](#prerequisites)  
- [Configuration](#configuration)  
- [Troubleshooting](#troubleshooting)  
- [Packaging the Extension](#packaging-the-extension)  
- [Roadmap](#roadmap)  
- [Contributing](#contributing)  
- [License](#license)  

---

## Overview

**DI & Service Navigator** is a Visual Studio Code extension designed to help .NET developers understand, visualize, and navigate Dependency Injection (DI) configurations in their projects. It scans C# code for Microsoft.Extensions.DependencyInjection registrations (e.g., `services.AddScoped<IUserService, UserService>()`) and injection sites (e.g., constructor parameters), groups them by project and lifetime, detects common issues like duplicates or unused services, and provides a tree view in the Explorer sidebar for easy navigation.

This tool is particularly useful in large .NET solutions where DI setup is spread across multiple files, making it hard to track services, lifetimes, and dependencies.

---

## Features

- **DI Registration Discovery**: Automatically detects registrations using Roslyn-based parsing with regex fallback for robustness.
- **Injection Site Mapping**: Identifies constructor parameters and associates them with registered services.
- **Lifetime Grouping**: Organizes services by Singleton, Scoped, and Transient lifetimes with color-coded visuals.
- **Conflict Detection**: Flags issues like duplicate implementations, multiple impls per lifetime, and unused services.
- **Tree View Navigation**: Interactive sidebar view to browse projects > lifetimes > services > injection sites/conflicts.
- **Go To Commands**: Quickly jump to registration implementations or injection sites in the editor.
- **Project Selection**: Scan specific projects or the entire workspace; supports multi-root workspaces.
- **Auto-Refresh**: Watches for file changes and refreshes analysis dynamically.
- **Configurable Scanning**: Exclude folders like bin/obj via settings.

---

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=chaluvadis.di-navigator) (once published) or sideload via VSIX.
2. Ensure .NET SDK 8.0+ is installed (required for the Roslyn parser build).
3. Open a .NET workspace (containing .csproj or .sln files).
4. The extension activates automatically on startup or when .NET files are detected.

---

## Usage

1. **Activate the View**: In the Explorer sidebar, look for the "DI Navigator" section (appears when .NET workspace is detected).
2. **Scan Projects**: 
   - Run `DI Navigator: Select Project` (Ctrl+Shift+P) to scan all or specific projects.
   - Or use `DI Navigator: Refresh Services` to re-scan.
3. **Browse Services**: Expand the tree:
   - Projects → Lifetimes (color-coded) → Services (with counts for registrations/sites/conflicts).
   - Click a service to go to its primary implementation.
   - Expand services to see injection sites or conflicts.
4. **Navigate**:
   - Right-click or use commands like `DI Navigator: Go to Implementation` / `Go to Injection Site`.
   - For conflicts, use `DI Navigator: Resolve Conflicts` to view and suggest fixes.
5. **Clear/Refresh**: Use `DI Navigator: Clear Project Selection` to scan the full workspace.

Example Tree View:
```
MyProject
├── Singleton (1 service)
│   └── IUserService (2 regs, 1 site, 1 conflict)
│       ├── UserServiceImpl.cs:42
│       └── Injection: UserController.ctor (IUserService)
│       └── Conflict: DuplicateImplementation
└── Scoped (3 services)
    └── ...
```

---

## Technical Details

- **Parsing**: Uses a custom Roslyn analyzer (C# project in `tools/roslyn-di-analyzer/`) for accurate AST traversal. Falls back to regex for parse errors.
- **Models**: Services grouped by [Lifetime](src/models.ts#L3) (Singleton/Scoped/Transient) and [ProjectDI](src/models.ts#L33).
- **Tree View**: Custom [TreeDataProvider](src/treeView.ts) with icons and commands.
- **Commands**: Registered in [package.json](package.json) and handled in [commands.ts](src/commands.ts).
- **Build**: NPM scripts compile TS to JS via esbuild and build the Roslyn parser via `dotnet build`.

The extension scans **/*.cs files in projects, excluding configured folders.

---

## Prerequisites

- **VS Code**: 1.104.0+
- **.NET SDK**: 8.0+ (for Roslyn parser; built manually via `dotnet build` in `tools/roslyn-di-analyzer/`).
- **Workspace**: .NET project(s) with C# files and DI registrations (Microsoft DI only).
- **Permissions**: Read access to workspace files.

---

## Configuration

Customize via VS Code Settings (Ctrl+,) under "DI Navigator":

- **diNavigator.excludeFolders**: Array of glob patterns to skip (default: `["**/bin/**", "**/obj/**", "**/Properties/**"]`).
  - Example: Add `"**/tests/**"` to exclude test projects.

No other settings yet; future versions may include parsing toggles.

---

## Troubleshooting

- **No DI Navigator View**: Ensure workspace has .NET files (.csproj/.sln/.cs). Run `DI Navigator: Refresh Services`.
- **Parsing Errors**: Check Output panel (DI Navigator) for logs. Roslyn requires .NET SDK; install from [dotnet.microsoft.com](https://dotnet.microsoft.com).
- **Slow Scans**: Large solutions? Exclude more folders or limit to selected projects.
- **Fallback to Regex**: Seen in logs if Roslyn fails (e.g., invalid C#). Report issues with sample code.
- **Conflicts Not Detected**: Current detection is basic; misses advanced cases like cycles.
- **Build Issues**: Run `dotnet build` manually in `tools/roslyn-di-analyzer/`.

If issues persist, file a [GitHub issue](https://github.com/chaluvadis/di-navigator/issues) with logs and a minimal repro.

---

## Packaging the Extension

1. Install dependencies: `npm install`
2. Build TypeScript: `npm run package` (compiles TS via esbuild).
3. Build Roslyn Analyzer: `cd tools/roslyn-di-analyzer && dotnet build` (builds the .NET parser).
4. Create VSIX: Use `vsce package` (install via `npm i -g @vscode/vsce`).
5. Publish: `vsce publish` (requires Azure DevOps or GitHub setup).

---

## Roadmap

- **Short-Term**: Enhance parsing for named registrations/Configure; implement code edits for conflict resolution; add search/filter in tree view.
- **Medium-Term**: Advanced conflict detection (cycles, lifetime mismatches); incremental parsing; graph visualization.
- **Long-Term**: Support other DI containers (Autofac); export reports; full semantic analysis with type resolution.

Contributions welcome!

---

## Contributing

1. Fork the repo and clone: `git clone https://github.com/chaluvadis/di-navigator`
2. Install: `npm install`
3. Develop: `npm run watch` (watches TS and esbuild).
4. Test: `npm test` (runs extension tests).
5. Build: `npm run package`
6. PR: Target `main` branch with clear description.

Guidelines: Follow ESLint/TS standards; add tests for new features; update README.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

*Built with ❤️ | [GitHub](https://github.com/chaluvadis) | [Issues](https://github.com/chaluvadis/di-navigator/issues)*
