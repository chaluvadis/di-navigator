namespace DIServiceAnalyzer.Models;

public record MissingRegistration
{
    public string ServiceType { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public ServiceScope SuggestedLifetime { get; set; }
    public string Reason { get; set; } = string.Empty;
    public List<InjectionLocation> InjectionLocations { get; set; } = [];
    public int InjectionCount => InjectionLocations.Count;
}

public record InjectionLocation
{
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public string ClassName { get; set; } = string.Empty;
    public string MemberName { get; set; } = string.Empty;
    public InjectionContext Context { get; set; }
}

public enum InjectionContext
{
    Constructor,
    Property,
    Method,
    Field
}

public record ConstructorAnalysis
{
    public string ClassName { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public List<ConstructorParameter> Parameters { get; set; } = [];
}

public record ConstructorParameter
{
    public string TypeName { get; set; } = string.Empty;
    public string ParameterName { get; set; } = string.Empty;
    public bool IsDependencyInjection { get; set; }
    public int LineNumber { get; set; }
}

public record InjectedDependency
{
    public string ServiceType { get; set; } = string.Empty;
    public string FilePath { get; set; } = string.Empty;
    public int LineNumber { get; set; }
    public string ClassName { get; set; } = string.Empty;
    public string MemberName { get; set; } = string.Empty;
    public InjectionContext Context { get; set; }
}