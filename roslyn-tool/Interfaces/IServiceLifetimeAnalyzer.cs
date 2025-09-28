namespace DIServiceAnalyzer.Interfaces;

public interface IServiceLifetimeAnalyzer
{
    List<ServiceLifetimeConflict> AnalyzeLifetimeConflicts(List<ProjectAnalysis> projects);
    List<ServiceDependencyIssue> AnalyzeServiceDependencies(List<ProjectAnalysis> projects);
    List<MissingRegistration> AnalyzeMissingRegistrations(List<ProjectAnalysis> projects);
}

public record ServiceLifetimeConflict
{
    public string ServiceType { get; set; } = string.Empty;
    public string ImplementationType { get; set; } = string.Empty;
    public ServiceScope CurrentLifetime { get; set; }
    public ServiceScope RecommendedLifetime { get; set; }
    public string ConflictReason { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public ConflictSeverity Severity { get; set; }
}

public record ServiceDependencyIssue
{
    public string ServiceType { get; set; } = string.Empty;
    public string DependencyType { get; set; } = string.Empty;
    public string IssueDescription { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public IssueSeverity Severity { get; set; }
}

public enum ConflictSeverity
{
    Low,
    Medium,
    High,
    Critical
}

public enum IssueSeverity
{
    Info,
    Warning,
    Error
}