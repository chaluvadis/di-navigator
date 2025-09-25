namespace DIServiceAnalyzer.Models;

public record AnalysisResult
{
    public string SolutionName { get; set; } = string.Empty;
    public List<ProjectAnalysis> Projects { get; set; } = [];
    public DateTime AnalyzedAt { get; set; }
    public AnalysisSummary Summary { get; set; } = new();
}
public record ProjectAnalysis
{
    public string ProjectName { get; set; } = string.Empty;
    public string ProjectType { get; set; } = string.Empty;
    public string ProjectPath { get; set; } = string.Empty;
    public List<ServiceRegistration> ServiceRegistrations { get; set; } = [];
    public List<CustomRegistry> CustomRegistries { get; set; } = [];
    public List<StartupConfiguration> StartupConfigurations { get; set; } = [];
    public ProjectMetadata Metadata { get; set; } = new();
}
public record ServiceRegistration
{
    public string ServiceType { get; set; } = string.Empty;
    public string ImplementationType { get; set; } = string.Empty;
    public ServiceScope Lifetime { get; set; }
    public string RegistrationMethod { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public string Namespace { get; set; } = string.Empty;
}
public record CustomRegistry
{
    public string RegistryName { get; set; } = string.Empty;
    public string RegistryType { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public List<string> RegisteredServices { get; set; } = [];
}
public record StartupConfiguration
{
    public string ConfigurationMethod { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public List<ServiceRegistration> ServiceRegistrations { get; set; } = [];
}
public record ProjectMetadata
{
    public string TargetFramework { get; set; } = string.Empty;
    public List<string> PackageReferences { get; set; } = [];
    public string OutputType { get; set; } = string.Empty;
    public List<string> ProjectReferences { get; set; } = [];
}
public record AnalysisSummary
{
    public int TotalProjects { get; set; }
    public int TotalServiceRegistrations { get; set; }
    public int TotalCustomRegistries { get; set; }
    public int TotalStartupConfigurations { get; set; }
    public Dictionary<string, int> ServiceLifetimes { get; set; } = [];
    public Dictionary<string, int> ProjectTypes { get; set; } = [];
}
public enum ServiceScope
{
    Transient,
    Scoped,
    Singleton,
    Controllers,
    Others
}

public record ParsedSolution
{
    public string SolutionName { get; set; } = string.Empty;
    public bool IsSlnx { get; set; } = false;
}

public record SolutionInfo
{
    public string SolutionPath { get; set; } = string.Empty;
    public string SolutionName { get; set; } = string.Empty;
    public List<ProjectInfo> Projects { get; set; } = [];
}
public record ProjectInfo
{
    public string Name { get; set; } = string.Empty;
    public string Path { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
}