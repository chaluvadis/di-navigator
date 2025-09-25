namespace DIServiceAnalyzer.Services;

public class SolutionParser(string baseDirectory)
{
    private readonly string _baseDirectory = baseDirectory ?? throw new ArgumentNullException(nameof(baseDirectory));
    private readonly Dictionary<string, string> _projectTypeCache = [];

    public List<ParsedSolution> DiscoverSolutions()
    {
        var solutions = new List<ParsedSolution>();
        try
        {
            // Use parallel processing to discover files faster
            var slnFiles = Directory.GetFiles(_baseDirectory, "*.sln", SearchOption.AllDirectories);
            var slnxFiles = Directory.GetFiles(_baseDirectory, "*.slnx", SearchOption.AllDirectories);

            // Group files by directory to handle migration scenarios
            var filesByDirectory = new Dictionary<string, List<string>>();

            // Process .sln files in parallel
            Parallel.ForEach(slnFiles, slnFile =>
            {
                var directory = Path.GetDirectoryName(slnFile) ?? string.Empty;
                lock (filesByDirectory)
                {
                    if (!filesByDirectory.ContainsKey(directory))
                        filesByDirectory[directory] = [];
                    filesByDirectory[directory].Add(slnFile);
                }
            });

            // Process .slnx files in parallel
            Parallel.ForEach(slnxFiles, slnxFile =>
            {
                var directory = Path.GetDirectoryName(slnxFile) ?? string.Empty;
                lock (filesByDirectory)
                {
                    if (!filesByDirectory.ContainsKey(directory))
                        filesByDirectory[directory] = [];
                    filesByDirectory[directory].Add(slnxFile);
                }
            });

            // Apply prioritization logic: prefer .slnx over .sln when both exist
            foreach (var directoryFiles in filesByDirectory.Values)
            {
                var hasSlnx = directoryFiles.Any(f => f.EndsWith(".slnx"));
                var hasSln = directoryFiles.Any(f => f.EndsWith(".sln"));

                if (hasSlnx)
                {
                    var solutionFiles = directoryFiles.Where(f => f.EndsWith(".slnx"));
                    solutions.AddRange(solutionFiles.Select(f => new ParsedSolution { SolutionName = f, IsSlnx = true }));
                }
                else if (hasSln)
                {
                    var solutionFiles = directoryFiles.Where(f => f.EndsWith(".sln"));
                    solutions.AddRange(solutionFiles.Select(f => new ParsedSolution { SolutionName = f, IsSlnx = false }));
                }
            }
        }
        catch
        {
            throw;
        }
        return solutions;
    }
    public Models.SolutionInfo ParseSolution(string solutionPath)
    {
        if (!File.Exists(solutionPath))
        {
            throw new FileNotFoundException($"Solution file not found: {solutionPath}");
        }

        var solution = new Models.SolutionInfo
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
    private void ParseSlnxFile(string solutionPath, Models.SolutionInfo solution)
    {
        try
        {
            var doc = new XmlDocument();
            doc.Load(solutionPath);

            var solutionDir = Path.GetDirectoryName(solutionPath) ?? string.Empty;

            // Parse projects from .slnx XML format
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

                        var projectInfo = new Models.ProjectInfo
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

    private void ParseSlnFile(string solutionPath, Models.SolutionInfo solution)
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

    private Models.ProjectInfo? ParseProjectLine(string line)
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
                return new Models.ProjectInfo
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
    private string DetermineProjectType(string projectPath)
    {
        // Use caching to avoid repeated file system operations
        if (_projectTypeCache.TryGetValue(projectPath, out var cachedType))
        {
            return cachedType;
        }

        try
        {
            var projectDir = Path.GetDirectoryName(projectPath) ?? string.Empty;
            var projectName = Path.GetFileNameWithoutExtension(projectPath);

            // Check for common ASP.NET Core patterns
            if (Directory.GetFiles(projectDir, "appsettings*.json", SearchOption.TopDirectoryOnly).Length != 0)
            {
                _projectTypeCache[projectPath] = "ASP.NET Core Application";
                return "ASP.NET Core Application";
            }

            if (projectName.EndsWith(".Web") || projectName.EndsWith(".Api"))
            {
                _projectTypeCache[projectPath] = "ASP.NET Core Web Application";
                return "ASP.NET Core Web Application";
            }

            if (projectName.EndsWith(".Test") || projectName.EndsWith(".Tests"))
            {
                _projectTypeCache[projectPath] = "Test Project";
                return "Test Project";
            }

            // Check project file for output type
            var csprojPath = Path.Combine(projectDir, projectName + ".csproj");
            if (File.Exists(csprojPath))
            {
                var csprojContent = File.ReadAllText(csprojPath);
                if (csprojContent.Contains("<OutputType>Exe</OutputType>"))
                {
                    _projectTypeCache[projectPath] = "Console Application";
                    return "Console Application";
                }
                if (csprojContent.Contains("<OutputType>Library</OutputType>"))
                {
                    _projectTypeCache[projectPath] = "Class Library";
                    return "Class Library";
                }
            }

            _projectTypeCache[projectPath] = "Unknown";
            return "Unknown";
        }
        catch
        {
            _projectTypeCache[projectPath] = "Unknown";
            return "Unknown";
        }
    }
}
