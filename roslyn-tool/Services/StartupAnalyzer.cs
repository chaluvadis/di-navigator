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

            var configureServicesMethod = methods.FirstOrDefault(m =>
                m.Identifier.Text.Equals("ConfigureServices", StringComparison.OrdinalIgnoreCase)
            );

            if (configureServicesMethod is not null)
            {
                configuration.LineNumber = configureServicesMethod
                                        .GetLocation()
                                        .GetLineSpan().StartLinePosition.Line + 1;
                var serviceRegistrations = _sra.AnalyzeServiceRegistrations(
                                                configureServicesMethod.ToString(),
                                                configuration.FilePath
                                            );
                configuration.ServiceRegistrations.AddRange(serviceRegistrations);
            }
            var allServiceRegistrations = _sra.AnalyzeServiceRegistrations(
                                                root.ToString(),
                                                configuration.FilePath
                                            );
            configuration.ServiceRegistrations.AddRange(allServiceRegistrations);
        }
        catch
        {
            throw;
        }
    }
    private void AnalyzeProgramClass(
        SyntaxNode root,
        StartupConfiguration configuration
    )
    {
        try
        {
            var sourceCode = root.ToString();
            // Check for top-level statements (modern .NET 6+ approach)
            var hasTopLevelStatements = HasTopLevelStatements(root);

            if (hasTopLevelStatements)
            {
                configuration.ConfigurationMethod = "Top-level Statements";
                configuration.LineNumber = 1; // Top-level statements start at line 1

                var registrations = _sra.AnalyzeServiceRegistrations(
                    sourceCode, configuration.FilePath);
                configuration.ServiceRegistrations.AddRange(registrations);
            }
            else if (sourceCode.Contains("var builder = WebApplication.CreateBuilder"))
            {
                configuration.ConfigurationMethod = "WebApplication.CreateBuilder";
                var registrations = _sra.AnalyzeServiceRegistrations(
                    sourceCode, configuration.FilePath);
                configuration.ServiceRegistrations.AddRange(registrations);
            }
            else if (sourceCode.Contains("Host.CreateDefaultBuilder"))
            {
                configuration.ConfigurationMethod = "Host.CreateDefaultBuilder";
                var registrations = _sra.AnalyzeServiceRegistrations(
                    sourceCode, configuration.FilePath);
                configuration.ServiceRegistrations.AddRange(registrations);
            }
            else if (sourceCode.Contains("ConfigureServices"))
            {
                configuration.ConfigurationMethod = "ConfigureServices";
                var registrations = _sra.AnalyzeServiceRegistrations(
                    sourceCode, configuration.FilePath);
                configuration.ServiceRegistrations.AddRange(registrations);
            }
            else
            {
                // Traditional Program.Main or other patterns
                configuration.ConfigurationMethod = "Program.Main";
                var registrations = _sra.AnalyzeServiceRegistrations(
                    sourceCode, configuration.FilePath);
                configuration.ServiceRegistrations.AddRange(registrations);
            }
        }
        catch
        {
            throw;
        }
    }
    private static bool HasTopLevelStatements(SyntaxNode root)
    {
        try
        {
            var sourceCode = root.ToString();
            var hasClassDeclaration = root.DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .Any(c => c.Identifier.Text == "Program");

            var hasTopLevelBuilder = sourceCode.Contains("var builder = WebApplication.CreateBuilder") ||
                                   sourceCode.Contains("var app = WebApplication.CreateBuilder") ||
                                   sourceCode.Contains("WebApplication.CreateBuilder");

            var hasTopLevelHost = sourceCode.Contains("Host.CreateDefaultBuilder");

            return !hasClassDeclaration && (hasTopLevelBuilder || hasTopLevelHost);
        }
        catch
        {
            return false;
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
                var registries = _sra.DetectCustomRegistries(sourceCode, file);
                customRegistries.AddRange(registries);
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
            foreach (var file in sourceFiles)
            {
                var sourceCode = File.ReadAllText(file);
                var registrations = _sra.AnalyzeServiceRegistrations(sourceCode, file);
                allRegistrations.AddRange(registrations);
            }

            // Deduplicate service registrations based on ServiceType, ImplementationType, and Lifetime
            var uniqueRegistrations = new List<ServiceRegistration>();
            var seenRegistrations = new HashSet<string>();

            foreach (var registration in allRegistrations)
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