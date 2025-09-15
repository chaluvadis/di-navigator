# DI & Service Navigator

![Logo](./icon.png)

*Visualize and navigate your .NET Dependency Injection registrations inside VSCode.*

---

## Table of Contents

- [Overview](#overview)  
- [Features](#features)  
- [Installation](#installation)  
- [Usage](#usage)  
- [Technical Details](#technical-details)  
- [Roadmap](#roadmap)  
- [Contributing](#contributing)  
- [License](#license)  

---

## Overview

**DI & Service Navigator** is a Visual Studio Code extension designed to help .NET developers understand, navigate, and troubleshoot their Dependency Injection (DI) setups in ASP.NET Core and other .NET projects.

.NET projects increasingly rely on DI patterns, but VSCode lacks built-in tooling to visualize service registrations, lifetimes, and injection sites. This extension fills that gap by parsing your source code and providing a powerful, intuitive sidebar view and navigation commands.

---

## Features

### Core (MVP)

- 🔍 **Service Registration Explorer**  
  Automatically detect and list all DI service registrations (`AddScoped`, `AddSingleton`, `AddTransient`) from your project’s `Program.cs`, `Startup.cs`, and extension methods.

- 🧩 **Lifetime Grouping**  
  Services are grouped by their lifetime scope (Singleton, Scoped, Transient) and color-coded for quick identification.

- 🔗 **Interface to Implementation Navigation**  
  Jump from interfaces registered in DI directly to their concrete implementations with “Go to Implementation.”

- 🧭 **Injection Site Discovery**  
  View all places where a service is injected via constructor or `[Inject]` attribute.

- ⚠️ **Conflict and Issue Detection**  
  Identify duplicate registrations, missing implementations, or potential circular dependencies.

- 🗂️ **Multi-Project Solution Support**  
  Parses DI registrations across multiple projects within your solution for comprehensive insight.

---

## Installation

1. Open VSCode  
2. Go to Extensions Marketplace (`Ctrl+Shift+X`)  
3. Search for **DI & Service Navigator**  
4. Click **Install**  
5. Reload VSCode if prompted

*Or install manually from the `.vsix` file if building locally.*

---

## Usage

1. Open your .NET or ASP.NET Core project folder in VSCode  
2. Open the **DI Navigator** sidebar panel  
3. Browse DI services grouped by lifetime  
4. Click any service to navigate to its implementation or injection points  
5. Watch for warnings or conflicts highlighted in the tree view  
6. Use context menus to generate boilerplate registration snippets (coming soon)  

---

## Technical Details

### How It Works

- **Code Parsing:**  
  The extension uses Roslyn (Microsoft’s .NET compiler platform) to parse your C# source files, extracting all `IServiceCollection` registrations.

- **Data Model:**  
  Services are categorized by lifetime and mapped to interfaces, implementations, and injection points.

- **VSCode Integration:**  
  Provides a sidebar TreeView, hover tooltips, and custom “Go to Implementation” commands using VSCode's extension API.

### Supported Project Types

- ASP.NET Core (6.0, 7.0, 8.0+)  
- Blazor Server / WASM  
- Multi-project solutions (.sln and .csproj)  

### Limitations

- Dynamic or reflection-based service registrations may not be detected  
- Registrations via third-party DI containers like Autofac require future support  
- Large solutions may incur initial analysis delay (caching planned)  

---

## Roadmap

| Version | Planned Features / Improvements |
|---------|---------------------------------|
| v0.1.0  | Core service parsing, TreeView UI, navigation support |
| v0.2.0  | Injection site discovery, conflict detection |
| v0.3.0  | Multi-project parsing, caching, performance optimizations |
| v0.4.0  | Visual dependency graph, quick-fix snippets |
| v1.0.0  | Stable release with documentation and tests |

Contributions and feedback are welcome!

---

## Contributing

We welcome contributions from the community! Here’s how you can help:

- Report bugs or feature requests via [GitHub Issues](https://github.com/your-repo/di-service-navigator/issues)  
- Submit pull requests with improvements or fixes  
- Help improve documentation and tests  

### Development Setup

1. Clone the repo  
2. Run `npm install`  
3. Use `npm run compile` to build the extension  
4. Launch in VSCode Extension Development Host (`F5`)  

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## Acknowledgements

- [Roslyn](https://github.com/dotnet/roslyn) for providing C# analysis tooling  
- The VSCode Extension API team  
- The .NET community for feedback and inspiration  

---

## Contact

For questions or collaboration inquiries, please open an issue or contact [your-email@example.com].

---

*Empower your .NET DI experience — one service at a time.*  
**DI & Service Navigator** | 2025
