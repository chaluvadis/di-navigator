namespace DIServiceAnalyzer.Services;

public class SolutionParser(string baseDirectory)
{
    private readonly string _baseDirectory =
            baseDirectory ?? throw new ArgumentNullException(nameof(baseDirectory));

    public List<ParsedSolution> DiscoverSolutions()
    {
        var solutions = new List<ParsedSolution>();
        try
        {
            // Get all solution files in a single operation
            var allSolutionFiles = Directory.GetFiles(_baseDirectory, "*.sln", SearchOption.AllDirectories)
                .Concat(Directory.GetFiles(_baseDirectory, "*.slnx", SearchOption.AllDirectories))
                .ToList();

            // Group files by directory to handle migration scenarios
            var filesByDirectory = new Dictionary<string, List<string>>();

            // Process all solution files in a single parallel loop
            Parallel.ForEach(allSolutionFiles, solutionFile =>
            {
                var directory = Path.GetDirectoryName(solutionFile) ?? string.Empty;
                lock (filesByDirectory)
                {
                    if (!filesByDirectory.ContainsKey(directory))
                        filesByDirectory[directory] = [];
                    filesByDirectory[directory].Add(solutionFile);
                }
            });

            // Apply prioritization logic: prefer .slnx over .sln when both exist
            foreach (var directoryFiles in filesByDirectory.Values)
            {
                var hasSlnx = directoryFiles.Any(f => f.EndsWith(".slnx"));
                var hasSln = directoryFiles.Any(f => f.EndsWith(".sln"));

                var slnFiles = hasSlnx
                    ? directoryFiles.Where(f => f.EndsWith(".slnx"))
                    : directoryFiles.Where(f => f.EndsWith(".sln"));

                solutions.AddRange(slnFiles.Select(f => new ParsedSolution
                {
                    SolutionName = f,
                    IsSlnx = hasSlnx
                }));
            }
        }
        catch
        {
            throw;
        }
        return solutions;
    }
    public ParsedSolutionInfo ParseSolution(string solutionPath)
    {
        if (!File.Exists(solutionPath))
        {
            throw new FileNotFoundException($"Solution file not found: {solutionPath}");
        }

        var solution = new ParsedSolutionInfo
        {
            SolutionPath = solutionPath,
            SolutionName = Path.GetFileNameWithoutExtension(solutionPath),
            Projects = []
        };

        try
        {
            if (solutionPath.EndsWith(".slnx"))
            {
                ParseSlnxFile(solutionPath, solution);
            }
            else
            {
                ParseSlnFile(solutionPath, solution);
            }
        }
        catch
        {
            throw;
        }

        return solution;
    }
    private void ParseSlnFile(string solutionPath, ParsedSolutionInfo solution)
    {
        try
        {
            var lines = File.ReadAllLines(solutionPath);
            var projectSection = false;
            foreach (var line in lines)
            {
                if (line.Contains("Project("))
                {
                    projectSection = true;
                }
                if (projectSection && line.Contains(".csproj"))
                {
                    var projectInfo = ParseProjectLine(line);
                    if (projectInfo != null)
                    {
                        solution.Projects.Add(projectInfo);
                    }
                }
                if (projectSection && line.Contains("EndProject"))
                {
                    projectSection = false;
                }
            }
        }
        catch
        {
            throw;
        }
    }
    private static void ParseSlnxFile(string solutionPath, ParsedSolutionInfo solution)
    {
        try
        {
            var doc = new XmlDocument();
            doc.Load(solutionPath);

            var solutionDir = Path.GetDirectoryName(solutionPath) ?? string.Empty;
            // .slnx files have the structure: <Solution><Folder><Project Path="..." /></Folder></Solution>
            var projectNodes = doc.SelectNodes("//Project");
            if (projectNodes != null)
            {
                foreach (XmlNode projectNode in projectNodes)
                {
                    var projectPath = projectNode.Attributes?["Path"]?.Value;
                    if (!string.IsNullOrEmpty(projectPath) && projectPath.EndsWith(".csproj"))
                    {
                        var projectName = Path.GetFileNameWithoutExtension(projectPath);

                        // Make path absolute if it's relative
                        if (!Path.IsPathRooted(projectPath))
                        {
                            projectPath = Path.Combine(solutionDir, projectPath);
                        }

                        // Normalize path separators (handle both / and \)
                        projectPath = projectPath.Replace('/', Path.DirectorySeparatorChar);

                        var projectInfo = new ParsedProjectInfo
                        {
                            Name = projectName,
                            Path = projectPath,
                            Type = DetermineProjectType(projectPath)
                        };

                        solution.Projects.Add(projectInfo);
                    }
                }
            }
        }
        catch
        {
            throw;
        }
    }
    private ParsedProjectInfo? ParseProjectLine(string line)
    {
        try
        {
            // Parse project line format: Project("{GUID}") = "ProjectName", "ProjectPath", "{GUID}"
            var match = Regex.Match(line, @"Project\(""[^""]+""\) = ""([^""]+)"", ""([^""]+)"", ""[^""]+""");
            if (match.Success)
            {
                var projectName = match.Groups[1].Value;
                var projectPath = match.Groups[2].Value;
                // Make path relative to solution directory if it's relative
                if (!Path.IsPathRooted(projectPath))
                {
                    var solutionDir = Path.GetDirectoryName(_baseDirectory) ?? string.Empty;
                    projectPath = Path.Combine(solutionDir, projectPath);
                }
                return new ParsedProjectInfo
                {
                    Name = projectName,
                    Path = projectPath,
                    Type = DetermineProjectType(projectPath)
                };
            }
        }
        catch
        {
            throw;
        }
        return null;
    }
    private static string DetermineProjectType(string projectPath)
    {
        return GetProjectTypeFromCsproj(projectPath);
    }
    private static string GetProjectTypeFromCsproj(string projectPath)
    {
        var (projectDir, projectName) = GetProjectDirAndName(projectPath);
        if (projectDir == null || projectName == null)
            return "Unknown";

        var csprojPath = Path.Combine(projectDir, $"{projectName}.csproj");
        if (!File.Exists(csprojPath))
            return "Unknown";

        try
        {
            var csprojContent = File.ReadAllText(csprojPath);
            return AnalyzeProjectContent(csprojContent);
        }
        catch
        {
            return "Unknown";
        }
    }
    private static (string? projectDir, string? projectName) GetProjectDirAndName(string projectPath)
    {
        var projectDir = Path.GetDirectoryName(projectPath);
        var projectName = Path.GetFileNameWithoutExtension(projectPath);
        return (projectDir, projectName);
    }
    private static string AnalyzeProjectContent(string csprojContent)
    {
        var contentUpper = csprojContent.ToUpperInvariant();

        // Use dictionary lookup for better performance
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

            // MAUI patterns
            ["MAUI"] = "MAUI Application",
            ["MICROSOFT.MAUI"] = "MAUI Application",

            // gRPC patterns
            ["GRPC"] = "gRPC Service",
            ["GRPC.ASPNETCORE"] = "gRPC Service",
            ["GRPC.NET.CLIENT"] = "gRPC Client",

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

            // Legacy patterns
            ["<OUTPUTTYPE>EXE</OUTPUTTYPE>"] = "Console Application",
            ["<OUTPUTTYPE>LIBRARY</OUTPUTTYPE>"] = "Class Library",

            // Additional modern patterns
            ["MVC"] = "ASP.NET Core MVC Application",
            ["RAZOR"] = "ASP.NET Core Razor Pages",
            ["SIGNALR"] = "ASP.NET Core with SignalR",
            ["IDENTITY"] = "ASP.NET Core with Identity"
        };

        // Single pass through patterns for better performance
        foreach (var (pattern, projectType) in projectTypePatterns)
        {
            if (contentUpper.Contains(pattern))
            {
                return projectType;
            }
        }

        return "Unknown";
    }
}
