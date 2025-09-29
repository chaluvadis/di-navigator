# DI Service Navigator

**Advanced dependency injection analysis and visualization for .NET projects**

[![Version 0.0.2](https://img.shields.io/badge/version-0.0.2-blue.svg)](https://github.com/chaluvadis/di-navigator)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.104.0+-blue.svg)](https://code.visualstudio.com/)
[![.NET](https://img.shields.io/badge/.NET-9.0+-purple.svg)](https://dotnet.microsoft.com/)

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [Architecture](#architecture)
- [Roslyn Tool](#roslyn-tool)
- [Configuration](#configuration)
- [Requirements](#requirements)
- [Development](#development)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**DI Navigator** is a powerful Visual Studio Code extension that provides comprehensive dependency injection analysis and visualization for .NET projects. Built with advanced Roslyn-based parsing, it offers deep insights into DI configurations, service lifetimes, injection patterns, and potential conflicts.

Perfect for large .NET solutions where DI setup spans multiple files and assemblies, making it challenging to track services, lifetimes, dependencies, and potential issues.

<img src="./extension.gif" alt="extension">

## Features

### 🔍 **Advanced Analysis**
- **Multi-Project Support**: Analyze entire solutions with multiple projects simultaneously
- **Roslyn-Powered Parsing**: Accurate AST-based analysis using custom Roslyn tool
- **Lifetime Conflict Detection**: Identify problematic service lifetime configurations
- **Service Dependency Analysis**: Track complex service relationships and dependencies
- **Custom Registry Support**: Analyze third-party DI containers and custom registrations

### 🎯 **Smart Discovery**
- **Registration Detection**: Find service registrations across all project files
- **Injection Site Mapping**: Locate constructor and property injection points
- **Startup Configuration Analysis**: Parse Program.cs and Startup.cs configurations
- **Metadata Extraction**: Capture project references, NuGet packages, and framework versions

### 📊 **Rich Visualization**
- **Interactive Tree View**: Hierarchical display of services by lifetime
- **Progress Reporting**: Real-time analysis progress with detailed steps
- **Service Details Panel**: Comprehensive information about each service
- **Dependency Graph**: Visual representation of service relationships
- **Conflict Reports**: Detailed conflict analysis with severity levels

### ⚡ **Enhanced Productivity**
- **Auto-Refresh**: Automatic analysis on file changes (configurable)
- **Quick Navigation**: Jump directly to registration and injection locations
- **Advanced Search**: Find services by name patterns with wildcards
- **Lifetime Filtering**: Filter and focus on specific service lifetimes
- **Data Validation**: Ensure analysis accuracy with built-in validation

### 🛠️ **Developer Experience**
- **Robust Error Handling**: Comprehensive error reporting and recovery
- **Data Persistence**: Maintain analysis results across VS Code sessions
- **Performance Optimized**: Efficient analysis with caching and parallel processing
- **Extensible Architecture**: Plugin system for custom analyzers

---

## Installation

### From VSIX (Manual Install)
1. Download the `.vsix` file from [GitHub Releases](https://github.com/chaluvadis/di-navigator/releases)
2. Run: `code --install-extension di-navigator-2.0.0.vsix`
3. Reload VS Code
---

## Usage

### Basic Workflow
1. **Open Project**: Open a .NET solution or project in VS Code
2. **Automatic Activation**: DI Navigator panel appears in the sidebar
3. **View Services**: Expand tree to explore services by lifetime
4. **Navigate Code**: Click items to jump to source locations
5. **Analyze Changes**: Use commands to refresh or re-analyze

### Tree View Structure
```
DI Navigator
├── ProjectName (Services: 15, Projects: 1)
│   ├── Singleton Services (3)
│   │   ├── IUserService
│   │   │   ├── Registrations (1)
│   │   │   │   └── Program.cs:25 - AddSingleton<UserService>()
│   │   │   └── Injection Sites (5)
│   │   │       ├── UserController.cs:15 (constructor)
│   │   │       └── AdminService.cs:8 (property)
│   │   ├── IConfiguration
│   │   │   ├── Registrations (1)
│   │   │   └── Injection Sites (12)
│   │   └── DatabaseContext
│   │       ├── Registrations (1)
│   │       └── Injection Sites (3)
│   ├── Scoped Services (7)
│   └── Transient Services (5)
├── 🔍 Search Services
├── ⚡ Refresh Analysis
└── ⚙️ Configuration
```

### Advanced Features
- **Search**: Use "DI Navigator: Search Services" to find specific services
- **Filter**: Filter services by lifetime using "DI Navigator: Filter by Lifetime"
- **Conflicts**: View conflicts with "DI Navigator: Detect Conflicts"
- **Graph**: See dependency relationships with "DI Navigator: Show Dependency Graph"

---

## Commands

| Command | Description |
|---------|-------------|
| `DI Navigator: Analyze Project` | Analyze current .NET project |
| `DI Navigator: Detect Conflicts` | Find DI configuration conflicts |
| `DI Navigator: Search Services` | Search services by name/pattern |
| `DI Navigator: Filter by Lifetime` | Filter services by lifetime |
| `DI Navigator: Show Dependency Graph` | Display service dependency graph |
| `DI Navigator: Show Service Details` | Show comprehensive service info |
| `DI Navigator: Navigate to Registration` | Jump to service registration |
| `DI Navigator: Refresh Tree View` | Update analysis results |
| `DI Navigator: Show Tree View` | Display the DI Navigator panel |
| `DI Navigator: Open Configuration` | Access extension settings |
| `DI Navigator: Recreate Tree View` | Troubleshooting command |

**Keyboard Shortcuts**: All commands available in Command Palette (`Ctrl+Shift+P`)

---

## Architecture

### Extension Structure
```
di-navigator/
├── src/                          # TypeScript source code
│   ├── extension.ts              # Main entry point
│   ├── core/                     # Core services
│   │   ├── DINavigatorExtension.ts   # Main extension class
│   │   ├── AnalysisService.ts        # Analysis orchestration
│   │   ├── TreeViewManager.ts        # Tree view management
│   │   ├── ErrorHandler.ts           # Error handling
│   │   ├── Logger.ts                 # Logging system
│   │   ├── DataValidator.ts          # Data validation
│   │   └── models.ts                 # TypeScript models
│   └── roslynToolService.ts      # Roslyn tool integration
├── roslyn-tool/                  # .NET Roslyn analyzer
│   ├── Program.cs               # Main analyzer program
│   ├── Services/                # Analysis services
│   ├── Models/                  # .NET data models
│   ├── Interfaces/              # Service interfaces
│   └── Plugins/                 # Plugin system
├── dist/                        # Compiled JavaScript
└── package.json                 # Extension manifest
```

### Component Overview
- **Frontend (TypeScript)**: VS Code extension API integration
- **Backend (.NET)**: Roslyn-based code analysis engine
- **Communication**: JSON-based interop between TS and .NET
- **Data Flow**: Analysis results flow from .NET tool to TypeScript models

### Key Design Principles
- **Separation of Concerns**: Clear boundaries between UI, analysis, and data
- **Error Resilience**: Comprehensive error handling and recovery
- **Performance**: Efficient analysis with caching and parallel processing
- **Extensibility**: Plugin architecture for custom analyzers

---

## Roslyn Tool

The extension includes a sophisticated .NET Roslyn analyzer (`roslyn-tool/`) that provides:

### Capabilities
- **AST Analysis**: Deep syntax tree traversal and analysis
- **Semantic Understanding**: Type resolution and dependency tracking
- **Multi-Language**: Support for C# and VB.NET projects
- **Incremental Updates**: Efficient re-analysis of changed files

### Build Process
```bash
# Build the Roslyn tool
npm run build-roslyn-tool

# Test with sample project
npm run test-roslyn-tool

# Package extension with Roslyn tool
npm run package-with-roslyn
```

### Configuration
The Roslyn tool can be configured via `roslyn-tool/appsettings.json`:
- **Excluded Directories**: Skip specified folders during analysis
- **Third-Party Containers**: Patterns for Autofac, Ninject, etc.
- **Project Types**: Supported project file extensions

---

## Configuration

Access settings via VS Code Settings (`Ctrl+,`) under "DI Navigator":

### Analysis Settings
- **`di-navigator.autoRefresh`**: Enable automatic refresh on file changes (default: `false`)
- **`di-navigator.refreshInterval`**: Auto-refresh interval in milliseconds (default: `5000`)
- **`di-navigator.enableCaching`**: Enable result caching (default: `true`)
- **`di-navigator.cacheExpirationMinutes`**: Cache expiration time (default: `30`)

### Performance Settings
- **`di-navigator.enableParallelProcessing`**: Enable parallel analysis (default: `true`)
- **`di-navigator.maxDegreeOfParallelism`**: Parallel processing limit (default: `-1` = unlimited)
- **`di-navigator.analyzeThirdPartyContainers`**: Include third-party DI containers (default: `false`)

### Advanced Settings
- **`di-navigator.logLevel`**: Minimum log level (`Debug`, `Info`, `Warning`, `Error`)
- **`di-navigator.pluginDirectory`**: Plugin directory path (default: `"plugins"`)
- **`di-navigator.enablePlugins`**: Enable plugin system (default: `true`)
- **`di-navigator.includeSourceCodeInOutput`**: Include source snippets (default: `false`)
- **`di-navigator.outputFormat`**: Analysis output format (`Json`, `Xml`, `Csv`)

---

## Requirements

### System Requirements
- **VS Code**: 1.104.0 or higher
- **.NET SDK**: 9.0 or higher
- **Operating System**: Windows, macOS, or Linux
- **Memory**: 2GB+ recommended for large solutions

### Supported Project Types
- **Solutions**: `.sln`, `.slnx` files
- **Projects**: `.csproj` files (SDK-style and legacy)
- **Frameworks**: .NET 6+

### Language Support
- **C#**: Full support for all language features
---

## Development

### Prerequisites
```bash
# Install Node.js dependencies
npm install

# Install .NET SDK 9.0+
# Install VS Code Extension Development tools
```

### Build Process
```bash
# Compile TypeScript
npm run compile

# Build Roslyn tool
npm run build-roslyn-tool

# Watch mode for development
npm run watch

# Package extension
npm run package
```

### Testing
```bash
# Test Roslyn tool with sample project
npm run test-roslyn-tool

# Run extension tests
npm test
```

### Project Structure
- **Source**: `src/` - TypeScript extension code
- **Roslyn Tool**: `roslyn-tool/` - .NET analysis engine
- **Build Output**: `dist/` - Compiled JavaScript
- **Tests**: `TestProject/` - Test cases and examples

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Areas for Contribution
- **Analysis Features**: New Roslyn analyzers
- **UI Enhancements**: Tree view improvements
- **Performance**: Optimization and caching
- **Testing**: Additional test cases
- **Documentation**: Guides and examples

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Built with ❤️ for the .NET community**

[🐛 Report Issues](https://github.com/chaluvadis/di-navigator/issues) |
[🚀 Releases](https://github.com/chaluvadis/di-navigator/releases)
