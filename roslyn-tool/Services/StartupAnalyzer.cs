namespace DIServiceAnalyzer.Services;

public class StartupAnalyzer(IServiceRegistryAnalyzer sra) : IStartupAnalyzer
{
    private readonly IServiceRegistryAnalyzer _sra = sra ?? throw new ArgumentNullException(nameof(sra));
    public List<StartupConfiguration> AnalyzeStartupFiles(List<string> sourceFiles)
    {
        var startupConfigurations = new List<StartupConfiguration>();
        try
        {
            var startupFiles = sourceFiles.Where(f =>
                Path.GetFileName(f).Equals("Startup.cs", StringComparison.OrdinalIgnoreCase) ||
                Path.GetFileName(f).Equals("Program.cs", StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Process startup files in parallel for better performance
            Parallel.ForEach(startupFiles, file =>
            {
                var configuration = AnalyzeStartupFile(file);
                if (configuration is not null)
                {
                    lock (startupConfigurations)
                    {
                        startupConfigurations.Add(configuration);
                    }
                }
            });
        }
        catch
        {
            throw;
        }
        return startupConfigurations;
    }
    private StartupConfiguration? AnalyzeStartupFile(string filePath)
    {
        try
        {
            var sourceCode = File.ReadAllText(filePath);
            var tree = CSharpSyntaxTree.ParseText(sourceCode);
            var root = tree.GetRoot();
            var configuration = new StartupConfiguration
            {
                FilePath = filePath,
                LineNumber = 1,
                ServiceRegistrations = []
            };
            if (IsStartup(filePath))
            {
                configuration.ConfigurationMethod = "Startup.ConfigureServices";
                AnalyzeStartupClass(root, configuration);
            }
            else if (IsProgramCs(filePath))
            {
                AnalyzeProgramClass(root, configuration);
            }
            return configuration;
        }
        catch
        {
            return null;
        }
    }
    private static bool IsProgramCs(string filePath)
        => Path.GetFileName(filePath).Equals("Program.cs", StringComparison.OrdinalIgnoreCase);
    private static bool IsStartup(string filePath)
        => Path.GetFileName(filePath).Equals("Startup.cs", StringComparison.OrdinalIgnoreCase);
    private void AnalyzeStartupClass(SyntaxNode root, StartupConfiguration configuration)
    {
        try
        {
            var methods = root.DescendantNodes().OfType<MethodDeclarationSyntax>();
            var methodsWithDi = methods.Where(m =>
                _sra.AnalyzeServiceRegistrations(m.ToString(), configuration.FilePath).Count != 0
            ).ToList();

            if (methodsWithDi.Count != 0)
            {
                // Use the first method that contains DI registrations
                var firstMethodWithDi = methodsWithDi.First();
                configuration.LineNumber = firstMethodWithDi
                                        .GetLocation()
                                        .GetLineSpan().StartLinePosition.Line + 1;
                var fnwExtension = Path.GetFileNameWithoutExtension(configuration.FilePath);
                configuration.ConfigurationMethod = $"{fnwExtension}.{firstMethodWithDi.Identifier.Text}";

                foreach (var method in methodsWithDi)
                {
                    var serviceRegistrations = _sra.AnalyzeServiceRegistrations(
                                                    method.ToString(),
                                                    configuration.FilePath
                                                );
                    configuration.ServiceRegistrations.AddRange(serviceRegistrations);
                }
            }
        }
        catch
        {
            throw;
        }
    }
    private void AnalyzeProgramClass(SyntaxNode root, StartupConfiguration config)
    {
        try
        {
            // Only analyze method bodies that contain DI registrations
            var methodDeclarations = root.DescendantNodes().OfType<MethodDeclarationSyntax>();
            var diMethods = methodDeclarations.Where(method =>
                _sra.AnalyzeServiceRegistrations(method.ToString(), config.FilePath).Count > 0
            );

            foreach (var method in diMethods)
            {
                var registrations = _sra.AnalyzeServiceRegistrations(method.ToString(), config.FilePath);
                config.ServiceRegistrations.AddRange(registrations);
            }

            config.ConfigurationMethod = "Program.Main";
        }
        catch
        {
            throw;
        }
    }
    public List<CustomRegistry> DetectCustomRegistries(List<string> sourceFiles)
    {
        var customRegistries = new List<CustomRegistry>();
        try
        {
            foreach (var file in sourceFiles)
            {
                var sourceCode = File.ReadAllText(file);
                var tree = CSharpSyntaxTree.ParseText(sourceCode);
                var root = tree.GetRoot();

                // Only analyze class and method declarations, not the entire file
                var classDeclarations = root.DescendantNodes().OfType<ClassDeclarationSyntax>();
                var methodDeclarations = root.DescendantNodes().OfType<MethodDeclarationSyntax>();

                foreach (var classDecl in classDeclarations)
                {
                    var registries = _sra.DetectCustomRegistries(classDecl.ToString(), file);
                    customRegistries.AddRange(registries);
                }

                foreach (var methodDecl in methodDeclarations)
                {
                    var registries = _sra.DetectCustomRegistries(methodDecl.ToString(), file);
                    customRegistries.AddRange(registries);
                }
            }
        }
        catch
        {
            throw;
        }
        return customRegistries;
    }
    public List<ServiceRegistration> FindAllServiceRegistrations(List<string> sourceFiles)
    {
        var allRegistrations = new List<ServiceRegistration>();
        try
        {
            // Separate startup files from other files
            var startupFiles = sourceFiles.Where(f =>
                Path.GetFileName(f).Equals("Program.cs", StringComparison.OrdinalIgnoreCase) ||
                Path.GetFileName(f).Equals("Startup.cs", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var otherFiles = sourceFiles.Except(startupFiles).ToList();
            foreach (var file in startupFiles)
            {
                var sourceCode = File.ReadAllText(file);
                var registrations = _sra.AnalyzeServiceRegistrations(sourceCode, file);
                allRegistrations.AddRange(registrations);
            }

            // Then, only analyze other files if they contain service registration methods
            // that are actually called from startup files
            foreach (var file in otherFiles)
            {
                var sourceCode = File.ReadAllText(file);
                // Check if this file contains service registration methods
                var hasServiceRegistrations = _sra.AnalyzeServiceRegistrations(sourceCode, file).Count != 0;

                if (hasServiceRegistrations)
                {
                    // Only include registrations from this file if it's actually referenced
                    // from a startup file (basic check for method calls)
                    var fileName = Path.GetFileNameWithoutExtension(file);
                    var isReferenced = startupFiles.Any(startupFile =>
                    {
                        var startupContent = File.ReadAllText(startupFile);
                        return startupContent.Contains(fileName) ||
                               startupContent.Contains("Add") && startupContent.Contains(fileName);
                    });

                    if (isReferenced)
                    {
                        var registrations = _sra.AnalyzeServiceRegistrations(sourceCode, file);
                        allRegistrations.AddRange(registrations);
                    }
                }
            }

            // Prioritize registrations from Program.cs over other files
            // and deduplicate based on ServiceType, ImplementationType, and Lifetime
            var uniqueRegistrations = new List<ServiceRegistration>();
            var seenRegistrations = new HashSet<string>();

            // Sort registrations to prioritize Program.cs files
            var sortedRegistrations = allRegistrations
                .OrderByDescending(r => r.FilePath.Contains("Program.cs") ? 1 : 0)
                .ToList();

            foreach (var registration in sortedRegistrations)
            {
                // Create a unique key based on service type, implementation type, and lifetime
                var key = $"{registration.ServiceType}:{registration.ImplementationType}:{registration.Lifetime}";

                if (!seenRegistrations.Contains(key))
                {
                    seenRegistrations.Add(key);
                    uniqueRegistrations.Add(registration);
                }
            }
            return uniqueRegistrations;
        }
        catch
        {
            throw;
        }
    }
}