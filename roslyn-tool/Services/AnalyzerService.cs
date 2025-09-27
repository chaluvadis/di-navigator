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

            // Ensure the directory exists
            if (!Directory.Exists(inputDirectory))
            {
                inputDirectory = Environment.CurrentDirectory;
            }

            // Create SolutionParser with the specified input directory
            var solutionParser = new SolutionParser(inputDirectory);
            var disconveredSolutions = solutionParser.DiscoverSolutions();

            // If no solutions found, check if the input is a specific solution file
            if (disconveredSolutions.Count == 0)
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

                    var projectInfo = new ParsedProjectInfo
                    {
                        Name = projectName,
                        Path = projectPath,
                        Type = "Console Application" // Default type for single project
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
            await Parallel.ForEachAsync(disconveredSolutions, async (solution, cancellationToken) =>
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
                        Interlocked.Increment(ref projectCount);

                        var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
                        if (projectAnalysis is not null)
                        {
                            lock (analysisResult.Projects)
                            {
                                analysisResult.Projects.Add(projectAnalysis);
                            }
                        }
                    });
                }
                catch
                {
                    // Error silently handled
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
                var projectAnalysis = await AnalyzeProjectAsync(projectInfo);
                if (projectAnalysis != null)
                {
                    lock (analysisResult.Projects)
                    {
                        analysisResult.Projects.Add(projectAnalysis);
                    }
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

    private async Task<ProjectAnalysis?> AnalyzeProjectAsync(ParsedProjectInfo projectInfo)
    {
        return await Task.Run(() =>
        {
            try
            {
                var projectAnalysis = new ProjectAnalysis
                {
                    ProjectName = projectInfo.Name,
                    ProjectType = projectInfo.Type,
                    ProjectPath = projectInfo.Path
                };

                // Analyze project metadata
                var metadata = _projectAnalyzer.AnalyzeProject(projectInfo.Path);
                projectAnalysis.Metadata = metadata;

                // Get source files
                var sourceFiles = _projectAnalyzer.GetSourceFiles(projectInfo.Path);
                if (sourceFiles.Count == 0)
                {
                    return projectAnalysis;
                }

                // Analyze service registrations
                var serviceRegistrations = _startupAnalyzer.FindAllServiceRegistrations(sourceFiles);
                projectAnalysis.ServiceRegistrations = serviceRegistrations;

                // Analyze startup configurations
                var startupConfigurations = _startupAnalyzer.AnalyzeStartupFiles(sourceFiles);
                projectAnalysis.StartupConfigurations = startupConfigurations;

                // Detect custom registries
                var customRegistries = _startupAnalyzer.DetectCustomRegistries(sourceFiles);
                projectAnalysis.CustomRegistries = customRegistries;

                return projectAnalysis;
            }
            catch
            {
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

        // Count service lifetimes
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