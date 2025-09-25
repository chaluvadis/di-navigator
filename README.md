# DI Service Navigator

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
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**DI Service Navigator** is a Visual Studio Code extension designed to help .NET developers understand, visualize, and navigate Dependency Injection (DI) configurations in their projects. It scans C# code for Microsoft.Extensions.DependencyInjection registrations and injection sites, groups them by service lifetime, and provides an integrated tree view in the Explorer sidebar for easy navigation.

This tool is particularly useful in large .NET solutions where DI setup is spread across multiple files, making it hard to track services, lifetimes, and dependencies.

---

## Features

- **DI Registration Discovery**: Automatically detects service registrations using Roslyn-based parsing with regex fallback for robustness
- **Injection Site Mapping**: Identifies constructor parameters and associates them with registered services
- **Lifetime Grouping**: Organizes services by Singleton, Scoped, and Transient lifetimes
- **Integrated Sidebar View**: Tree view appears directly in the Explorer sidebar without requiring additional activity bar icons
- **Custom Icons**: Uses extension-specific icons for consistent branding throughout the interface
- **Quick Navigation**: Click on services and registrations to jump directly to their locations in code
- **Smart Analysis**: Automatically activates when C# projects are detected in the workspace
- **Conflict Detection**: Identifies potential dependency injection conflicts and highlights them

---

## Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=chaluvadis.di-navigator) (once published) or sideload via VSIX
2. Ensure .NET SDK 8.0+ is installed (required for the Roslyn parser build)
3. Open a .NET workspace (containing .csproj or .sln files)
4. The extension activates automatically when .NET projects are detected

---

## Usage

1. **View Activation**: The "DI Services" section appears automatically in the Explorer sidebar when a .NET workspace is opened
2. **Browse Services**: Expand the tree to explore:
   - Service lifetimes (Singleton, Scoped, Transient)
   - Individual services with registration and injection counts
   - Registration locations and injection sites
3. **Navigate Code**: Click on any item to jump directly to its location in the source code
4. **Refresh Analysis**: Use the "DI Navigator: Refresh Tree View" command to update the analysis

Example Tree View:
```
DI Services
├── Singleton Services (2)
│   ├── IUserService (1 registration, 3 injection sites)
│   │   ├── Registration: Startup.cs:25
│   │   ├── Injection: UserController.cs:15
│   │   └── Injection: AdminController.cs:22
│   └── IConfiguration (1 registration, 5 injection sites)
│       └── Registration: Program.cs:12
└── Scoped Services (3)
    ├── IRepository<User> (2 registrations, 4 injection sites)
    └── ...
```

---

## Technical Details

- **Parsing Engine**: Custom Roslyn analyzer built in C# (located in `roslyn-tool/`) for accurate AST traversal with regex fallback
- **Data Models**: Services organized by lifetime with detailed registration and injection site information
- **Tree View**: Integrated sidebar implementation using VS Code's native tree view API
- **Icon System**: Custom extension icons used throughout the interface for consistent branding
- **Build Process**: TypeScript compilation via esbuild with integrated Roslyn tool building

The extension scans all `*.cs` files in .NET projects, excluding configured folders like `bin/`, `obj/`, and `Properties/`.

## Architecture

The extension follows a clean, modular architecture:

- **extension.ts**: Main entry point and activation logic
- **models.ts**: Data models for services, registrations, and injection sites
- **roslynDiAnalyzer.ts**: Roslyn-based code analysis engine
- **roslynToolService.ts**: Service for managing the external Roslyn tool
- **core/AnalysisService.ts**: Core analysis orchestration
- **core/DINavigatorExtension.ts**: Main extension class
- **core/ErrorHandler.ts**: Centralized error handling
- **core/Logger.ts**: Logging infrastructure
- **core/TreeViewManager.ts**: Tree view implementation with custom icons

Key architectural strengths include separation of concerns, robust error handling, and seamless integration with VS Code's native APIs.

---

## Prerequisites

- **VS Code**: 1.104.0+
- **.NET SDK**: 8.0+ (for building the Roslyn parser tool)
- **Workspace**: .NET project(s) with C# files containing DI registrations
- **Permissions**: Read access to workspace files
- **C# Extension**: Install the [C# extension](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp) for full C# language support

---

## Configuration

Customize via VS Code Settings (Ctrl+,) under "DI Navigator":

- `di-navigator.useExternalTools`: Enable/disable external Roslyn tools (default: true)
- `di-navigator.analysisDepth`: Set analysis depth - "basic", "standard", or "deep" (default: "standard")
- `di-navigator.showInjectionSites`: Show/hide injection sites in analysis (default: true)
- `di-navigator.detectCycles`: Enable/disable circular dependency detection (default: true)
- `di-navigator.highlightConflicts`: Enable/disable conflict highlighting (default: true)
- `di-navigator.autoRefresh`: Enable automatic refresh on file changes (default: false)
- `di-navigator.refreshInterval`: Auto-refresh interval in milliseconds (default: 5000)

---

## Development

### Setup
1. Clone the repository: `git clone https://github.com/chaluvadis/di-navigator`
2. Install dependencies: `npm install`
3. Build the Roslyn tool: `npm run build-roslyn-tool`

### Development Commands
- `npm run compile`: Compile TypeScript to JavaScript
- `npm run watch`: Watch mode for continuous development
- `npm run lint`: Run ESLint checks
- `npm run test`: Run extension tests
- `npm run package`: Create VSIX package
- `npm run package-with-roslyn`: Create package with built Roslyn tool

### Project Structure
```
src/
├── extension.ts              # Main entry point
├── models.ts                 # Data models
├── roslynDiAnalyzer.ts       # Roslyn analysis
├── roslynToolService.ts      # Roslyn tool management
└── core/                     # Core services
    ├── AnalysisService.ts
    ├── DINavigatorExtension.ts
    ├── ErrorHandler.ts
    ├── Logger.ts
    └── TreeViewManager.ts

roslyn-tool/                  # C# Roslyn analyzer
├── DIServiceAnalyzer.csproj
├── Program.cs
└── Services/
    └── ...
```

---

## Contributing

1. Fork and clone: `git clone https://github.com/chaluvadis/di-navigator`
2. Install dependencies: `npm install`
3. Build Roslyn tool: `npm run build-roslyn-tool`
4. Develop with: `npm run watch`
5. Test: `npm test`
6. Create package: `npm run package-with-roslyn`
7. Submit PR to `main` branch

**Guidelines**: Follow ESLint/TypeScript standards, add tests for new features, and update this README for any significant changes.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

*Built with ❤️ | [GitHub](https://github.com/chaluvadis) | [Issues](https://github.com/chaluvadis/di-navigator/issues)*
