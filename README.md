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

**DI & Service Navigator** is a Visual Studio Code extension designed to help .NET developers understand, visualize, and navigate Dependency Injection (DI) configurations in their projects. It scans C# code for Microsoft.Extensions.DependencyInjection registrations (e.g., `services.AddScoped<IUserService, UserService>()`) and injection sites (e.g., constructor parameters), groups them by project and lifetime, and provides a tree view in the Explorer sidebar for easy navigation.

This tool is particularly useful in large .NET solutions where DI setup is spread across multiple files, making it hard to track services, lifetimes, and dependencies.

---

## Features

- **DI Registration Discovery**: Automatically detects registrations using Roslyn-based parsing with regex fallback for robustness.
- **Injection Site Mapping**: Identifies constructor parameters and associates them with registered services.
- **Lifetime Grouping**: Organizes services by Singleton, Scoped, and Transient lifetimes with color-coded visuals.
- **Tree View Navigation**: Interactive sidebar view to browse projects > lifetimes > services > injection sites.
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
   - Projects → Lifetimes (color-coded) → Services (with counts for registrations/sites).
   - Click a service to go to its primary implementation.
   - Expand services to see injection sites.
4. **Navigate**:
   - Right-click or use commands like `DI Navigator: Go to Implementation` / `Go to Injection Site`.
5. **Clear/Refresh**: Use `DI Navigator: Clear Project Selection` to scan the full workspace.

Example Tree View:
```
MyProject
├── Singleton (1 service)
│   └── IUserService (2 regs, 1 site)
│       ├── UserServiceImpl.cs:42
│       └── Injection: UserController.ctor (IUserService)
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

## Architecture

The di-navigator extension follows a modular architecture with clear separation of concerns: activation in extension.ts, data models in models.ts, parsing in parser.ts, state management in serviceProvider.ts, tree view in treeView.ts, and commands in commands.ts. Key strengths include reactivity via file watchers and debouncing, lightweight parsing without heavy dependencies, user-centric features like quick picks and navigation, and extensibility through hierarchical models.

---

## Prerequisites

- **VS Code**: 1.104.0+
- **.NET SDK**: 8.0+ (for Roslyn parser; built manually via `dotnet build` in `tools/roslyn-di-analyzer/`).
- **Workspace**: .NET project(s) with C# files and DI registrations (Microsoft DI only).
- **Permissions**: Read access to workspace files.
- **OmniSharp**: Install the [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp) (powered by OmniSharp) from the VS Code Marketplace for full C# language support, including IntelliSense, debugging, and project loading.

---

## Configuration

Customize via VS Code Settings (Ctrl+,) under "DI Navigator":

- **diNavigator.excludeFolders**: Array of glob patterns to skip (default: `["**/bin/**", "**/obj/**", "**/Properties/**"]`).
  - Example: Add `"**/tests/**"` to exclude test projects.

No other settings yet; future versions may include parsing toggles.

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
