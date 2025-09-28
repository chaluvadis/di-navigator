namespace DIServiceAnalyzer.Services;

public class AnalyzerService(
    IProjectAnalyzer projectAnalyzer,
    IStartupAnalyzer startupAnalyzer
) : IAnalyzerService
{
    private readonly IProjectAnalyzer _projectAnalyzer = projectAnalyzer ?? throw new ArgumentNullException(nameof(projectAnalyzer));
    private readonly IStartupAnalyzer _startupAnalyzer = startupAnalyzer ?? throw new ArgumentNullException(nameof(startupAnalyzer));

    public async Task<AnalysisResult> AnalyzeSolutionsAsync(string inputDirectory)
    {
        var analysisResult = new AnalysisResult
        {
            AnalyzedAt = DateTime.UtcNow
        };

        try
        {
            // Validate and normalize input directory
            if (string.IsNullOrWhiteSpace(inputDirectory))
            {
                inputDirectory = Environment.CurrentDirectory;
            }

            // Check if inputDirectory is actually a solution file
            if (File.Exists(inputDirectory) && (inputDirectory.EndsWith(".sln") || inputDirectory.EndsWith(".slnx")))
            {
                return await AnalyzeSingleSolutionAsync(inputDirectory);
            }

            // Check if inputDirectory is actually a project file
            if (File.Exists(inputDirectory) && inputDirectory.EndsWith(".csproj"))
            {
                return await AnalyzeSingleProjectAsync(inputDirectory);
            }

            // Ensure the directory exists
            if (!Directory.Exists(inputDirectory))
            {
                inputDirectory = Environment.CurrentDirectory;
            }

            // Create SolutionParser with the specified input directory
            var solutionParser = new SolutionParser(inputDirectory);
            var discoveredSolutions = solutionParser.DiscoverSolutions();

            // If no solutions found, check if the input is a specific solution file
            if (discoveredSolutions.Count == 0)
            {
                var solutionFile = Path.Combine(inputDirectory, Path.GetFileName(inputDirectory));
                if (File.Exists(solutionFile) && (solutionFile.EndsWith(".sln") || solutionFile.EndsWith(".slnx")))
                {
                    var singleResult = await AnalyzeSingleSolutionAsync(solutionFile);
                    if (singleResult.Projects.Count > 0)
                    {
                        return singleResult;
                    }
                }

                // Check if the input directory contains a .csproj file (single project scenario)
                var csprojFiles = Directory.GetFiles(inputDirectory, "*.csproj", SearchOption.TopDirectoryOnly);
                if (csprojFiles.Length > 0)
                {
                    var projectPath = csprojFiles[0];
                    var projectName = Path.GetFileNameWithoutExtension(projectPath);

                    // Determine actual project type
                    var projectType = "Unknown";
                    try
                    {
                        projectType = GetProjectTypeFromCsproj(projectPath);
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"Warning: Could not determine project type for {projectPath}: {ex.Message}");
                        projectType = "Unknown";
                    }

                    var projectInfo = new ParsedProjectInfo
                    {
                        Name = projectName,
                        Path = projectPath,
                        Type = projectType
                    };

                    var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
                    if (projectAnalysis != null)
                    {
                        analysisResult.Projects.Add(projectAnalysis);
                        analysisResult.SolutionName = projectName;
                        GenerateSummary(analysisResult);
                        return analysisResult;
                    }
                }

                return analysisResult;
            }

            var solutionCount = 0;
            // Process solutions in parallel for better performance
            await Parallel.ForEachAsync(discoveredSolutions, async (solution, cancellationToken) =>
            {
                var solutionPath = solution.SolutionName;
                Interlocked.Increment(ref solutionCount);

                try
                {
                    var solutionInfo = solutionParser.ParseSolution(solutionPath);
                    analysisResult.SolutionName = solutionInfo.SolutionName;

                    var projectCount = 0;
                    // Process projects in parallel within each solution
                    await Parallel.ForEachAsync(solutionInfo.Projects, async (projectInfo, ct) =>
                    {
                        try
                        {
                            Interlocked.Increment(ref projectCount);

                            var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
                            if (projectAnalysis is not null)
                            {
                                lock (analysisResult.Projects)
                                {
                                    analysisResult.Projects.Add(projectAnalysis);
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            Console.WriteLine($"Warning: Failed to analyze project {projectInfo.Name}: {ex.Message}");
                            // Continue with other projects
                        }
                    });
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error processing solution {solutionPath}: {ex.Message}");
                    // Continue with other solutions
                }
            });

            // Generate summary
            GenerateSummary(analysisResult);
        }
        catch
        {
            throw;
        }

        return analysisResult;
    }

    public async Task<AnalysisResult> AnalyzeSingleSolutionAsync(string solutionPath)
    {
        var analysisResult = new AnalysisResult
        {
            AnalyzedAt = DateTime.UtcNow
        };

        try
        {
            // Create SolutionParser with the solution's directory
            var solutionDirectory = Path.GetDirectoryName(solutionPath) ?? string.Empty;

            // Validate the solution directory exists
            if (string.IsNullOrEmpty(solutionDirectory) || !Directory.Exists(solutionDirectory))
            {
                return analysisResult;
            }

            var solutionParser = new SolutionParser(solutionDirectory);
            var solutionInfo = solutionParser.ParseSolution(solutionPath);
            analysisResult.SolutionName = solutionInfo.SolutionName;

            // Analyze each project in the solution with parallel processing
            await Parallel.ForEachAsync(solutionInfo.Projects, async (projectInfo, cancellationToken) =>
            {
                try
                {
                    var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
                    if (projectAnalysis != null)
                    {
                        lock (analysisResult.Projects)
                        {
                            analysisResult.Projects.Add(projectAnalysis);
                        }
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Warning: Failed to analyze project {projectInfo.Name} in solution {solutionPath}: {ex.Message}");
                    // Continue with other projects
                }
            });

            // Generate summary
            GenerateSummary(analysisResult);
        }
        catch
        {
            throw;
        }

        return analysisResult;
    }

    public async Task<AnalysisResult> AnalyzeSingleProjectAsync(string projectPath)
    {
        var analysisResult = new AnalysisResult
        {
            AnalyzedAt = DateTime.UtcNow
        };

        try
        {
            if (!File.Exists(projectPath) || !projectPath.EndsWith(".csproj"))
            {
                return analysisResult;
            }

            var projectName = Path.GetFileNameWithoutExtension(projectPath);
            var projectDir = Path.GetDirectoryName(projectPath) ?? string.Empty;

            // Determine project type
            var projectType = "Unknown";
            try
            {
                var projectTypeTemp = GetProjectTypeFromCsproj(projectPath);
                if (!string.IsNullOrEmpty(projectTypeTemp))
                {
                    projectType = projectTypeTemp;
                }
            }
            catch
            {
                projectType = "Unknown";
            }

            var projectInfo = new ParsedProjectInfo
            {
                Name = projectName,
                Path = projectPath,
                Type = projectType
            };

            var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
            if (projectAnalysis != null)
            {
                analysisResult.Projects.Add(projectAnalysis);
                analysisResult.SolutionName = projectName;
                GenerateSummary(analysisResult);
            }
        }
        catch
        {
            throw;
        }

        return analysisResult;
    }

    private static string GetProjectTypeFromCsproj(string projectPath)
    {
        try
        {
            if (!File.Exists(projectPath))
                return "Unknown";

            // Read .csproj file content with size limit for performance
            const int maxFileSize = 1024 * 1024; // 1MB limit
            var fileInfo = new FileInfo(projectPath);
            if (fileInfo.Length > maxFileSize)
            {
                Console.WriteLine($"Warning: .csproj file too large: {projectPath}");
                return "Unknown";
            }

            var csprojContent = File.ReadAllText(projectPath);
            return AnalyzeProjectContent(csprojContent);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error analyzing project type for {projectPath}: {ex.Message}");
            return "Unknown";
        }
    }

    private static string AnalyzeProjectContent(string csprojContent)
    {
        var contentUpper = csprojContent.ToUpperInvariant();

        // Enhanced dictionary with comprehensive project type patterns
        var projectTypePatterns = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            // Modern ASP.NET Core patterns
            ["MICROSOFT.NET.SDK.WEB"] = "ASP.NET Core Web Application",
            ["MICROSOFT.ASPNETCORE"] = "ASP.NET Core Web Application",
            ["SWASHBUCKLE.ASPNETCORE"] = "ASP.NET Core Web Application with Swagger",

            // Minimal API patterns
            ["MINIMAL"] = "Minimal API Application",
            ["MICROSOFT.ASPNETCORE.MINIMALAPI"] = "Minimal API Application",

            // Blazor patterns
            ["BLAZOR"] = "Blazor Application",
            ["BLAZORSERVER"] = "Blazor Server Application",
            ["BLAZORWASM"] = "Blazor WebAssembly Application",
            ["BLAZORHYBRID"] = "Blazor Hybrid Application",
            ["MICROSOFT.ASPNETCORE.COMPONENTS"] = "Blazor Application",
            ["MICROSOFT.ASPNETCORE.COMPONENTS.WEB"] = "Blazor Server Application",

            // MAUI patterns
            ["MAUI"] = "MAUI Application",
            ["MICROSOFT.MAUI"] = "MAUI Application",
            ["MICROSOFT.NET.SDK.MAUI"] = "MAUI Application",

            // gRPC patterns
            ["GRPC"] = "gRPC Service",
            ["GRPC.ASPNETCORE"] = "gRPC Service",
            ["GRPC.NET.CLIENT"] = "gRPC Client",
            ["GOOGLE.PROTOBUF"] = "gRPC Service",

            // Worker Service patterns
            ["WORKERSERVICE"] = "Worker Service",
            ["MICROSOFT.WORKERSERVICE"] = "Worker Service",

            // Azure Functions patterns
            ["AZUREFUNCTIONS"] = "Azure Functions",
            ["MICROSOFT.AZURE.FUNCTIONS"] = "Azure Functions",
            ["MICROSOFT.NET.SDK.FUNCTIONS"] = "Azure Functions",

            // Test project patterns
            ["MICROSOFT.NET.SDK.TEST"] = "Test Project",
            ["MICROSOFT.NET.TEST.SDK"] = "Test Project",
            ["XUNIT"] = "xUnit Test Project",
            ["NUNIT"] = "NUnit Test Project",
            ["MSTEST"] = "MSTest Test Project",
            ["XUNIT.CORE"] = "xUnit Test Project",
            ["NUNIT3TESTADAPTER"] = "NUnit Test Project",
            ["MSTEST.TESTADAPTER"] = "MSTest Test Project",

            // Output type patterns
            ["<OUTPUTTYPE>EXE</OUTPUTTYPE>"] = "Console Application",
            ["<OUTPUTTYPE>LIBRARY</OUTPUTTYPE>"] = "Class Library",
            ["<OUTPUTTYPE>WINEXE</OUTPUTTYPE>"] = "Windows Application",

            // Additional modern patterns
            ["MVC"] = "ASP.NET Core MVC Application",
            ["RAZOR"] = "ASP.NET Core Razor Pages",
            ["SIGNALR"] = "ASP.NET Core with SignalR",
            ["IDENTITY"] = "ASP.NET Core with Identity",
            ["AUTHENTICATION"] = "ASP.NET Core with Authentication",
            ["AUTHORIZATION"] = "ASP.NET Core with Authorization",
            ["CORS"] = "ASP.NET Core with CORS",
            ["HEALTHCHECKS"] = "ASP.NET Core with Health Checks",
            ["DOCKER"] = "Docker Application",
            ["KUBERNETES"] = "Kubernetes Application",
            ["HELM"] = "Helm Application"
        };

        // Priority-ordered detection (most specific patterns first)
        var priorityPatterns = new[]
        {
            // Most specific patterns (check first)
            "MICROSOFT.ASPNETCORE.MINIMALAPI",
            "BLAZORHYBRID",
            "BLAZORWASM",
            "BLAZORSERVER",
            "MICROSOFT.MAUI",
            "GRPC.ASPNETCORE",
            "AZUREFUNCTIONS",
            "WORKERSERVICE",
            "SWASHBUCKLE.ASPNETCORE",
            "XUNIT.CORE",
            "NUNIT3TESTADAPTER",
            "MSTEST.TESTADAPTER"
        };

        // Check priority patterns first
        foreach (var pattern in priorityPatterns)
        {
            if (contentUpper.Contains(pattern.ToUpperInvariant()))
            {
                return projectTypePatterns[pattern];
            }
        }

        // Then check all patterns for matches
        foreach (var (pattern, projectType) in projectTypePatterns)
        {
            if (contentUpper.Contains(pattern.ToUpperInvariant()))
            {
                return projectType;
            }
        }

        // Fallback: try to infer from TargetFramework
        if (contentUpper.Contains("NET9.0") || contentUpper.Contains("NET8.0") || contentUpper.Contains("NET7.0") || contentUpper.Contains("NET6.0"))
        {
            if (contentUpper.Contains("WEB"))
                return "ASP.NET Core Web Application";
            if (contentUpper.Contains("WORKER"))
                return "Worker Service";
            if (contentUpper.Contains("TEST"))
                return "Test Project";
        }

        return "Unknown";
    }

    private async Task<ProjectAnalysis?> AnalyzeProjectAsync(ParsedProjectInfo projectInfo)
    {
        return await Task.Run(() =>
        {
            try
            {
                Console.WriteLine($"Analyzing project: {projectInfo.Name} ({projectInfo.Type})");

                var projectAnalysis = new ProjectAnalysis
                {
                    ProjectName = projectInfo.Name,
                    ProjectType = projectInfo.Type,
                    ProjectPath = projectInfo.Path
                };

                try
                {
                    // Analyze project metadata
                    var metadata = _projectAnalyzer.AnalyzeProject(projectInfo.Path);
                    projectAnalysis.Metadata = metadata;
                    Console.WriteLine($"  Metadata: {metadata.TargetFramework}, {metadata.PackageReferences.Count} packages");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"  Warning: Failed to analyze project metadata: {ex.Message}");
                    projectAnalysis.Metadata = new ProjectMetadata(); // Use empty metadata
                }

                try
                {
                    // Get source files
                    var sourceFiles = _projectAnalyzer.GetSourceFiles(projectInfo.Path);
                    Console.WriteLine($"  Found {sourceFiles.Count} source files");

                    if (sourceFiles.Count == 0)
                    {
                        Console.WriteLine("  No source files found, returning basic project info");
                        return projectAnalysis;
                    }

                    // Analyze service registrations
                    var serviceRegistrations = _startupAnalyzer.FindAllServiceRegistrations(sourceFiles);
                    projectAnalysis.ServiceRegistrations = serviceRegistrations;
                    Console.WriteLine($"  Found {serviceRegistrations.Count} service registrations");

                    // Analyze startup configurations
                    var startupConfigurations = _startupAnalyzer.AnalyzeStartupFiles(sourceFiles);
                    projectAnalysis.StartupConfigurations = startupConfigurations;
                    Console.WriteLine($"  Found {startupConfigurations.Count} startup configurations");

                    // Detect custom registries
                    var customRegistries = _startupAnalyzer.DetectCustomRegistries(sourceFiles);
                    projectAnalysis.CustomRegistries = customRegistries;
                    Console.WriteLine($"  Found {customRegistries.Count} custom registries");
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"  Error analyzing project content: {ex.Message}");
                    // Return project with metadata only
                    return projectAnalysis;
                }

                return projectAnalysis;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error analyzing project {projectInfo.Name}: {ex.Message}");
                throw;
            }
        });
    }

    private static void GenerateSummary(AnalysisResult analysisResult)
    {
        var summary = new AnalysisSummary
        {
            TotalProjects = analysisResult.Projects.Count,
            TotalServiceRegistrations = analysisResult.Projects.Sum(p => p.ServiceRegistrations.Count),
            TotalCustomRegistries = analysisResult.Projects.Sum(p => p.CustomRegistries.Count),
            TotalStartupConfigurations = analysisResult.Projects.Sum(p => p.StartupConfigurations.Count)
        };

        // Count service lifetimes and project types
        foreach (var project in analysisResult.Projects)
        {
            foreach (var registration in project.ServiceRegistrations)
            {
                var lifetime = registration.Lifetime.ToString();
                if (summary.ServiceLifetimes.TryGetValue(lifetime, out int value))
                {
                    summary.ServiceLifetimes[lifetime] = ++value;
                }
                else
                {
                    summary.ServiceLifetimes[lifetime] = 1;
                }
            }

            // Count project types
            var projectType = project.ProjectType;
            if (summary.ProjectTypes.ContainsKey(projectType))
            {
                summary.ProjectTypes[projectType]++;
            }
            else
            {
                summary.ProjectTypes[projectType] = 1;
            }
        }

        analysisResult.Summary = summary;
    }
}