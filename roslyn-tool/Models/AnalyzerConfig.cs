namespace DIServiceAnalyzer.Models;

public class AnalyzerConfig
{
    public LogLevel LogLevel { get; set; } = LogLevel.Info;
    public bool EnableParallelProcessing { get; set; } = true;
    public int MaxDegreeOfParallelism { get; set; } = -1; // -1 means unlimited
    public int FileSizeLimit { get; set; } = 10 * 1024 * 1024; // 10MB
    public string[] ExcludedDirectories { get; set; } = ["bin", "obj", "node_modules", ".git"];
    public string[] SupportedFileExtensions { get; set; } = [".cs"];
    public bool EnableCaching { get; set; } = true;
    public int CacheExpirationMinutes { get; set; } = 30;
    public OutputFormat OutputFormat { get; set; } = OutputFormat.Json;
    public bool IncludeSourceCodeInOutput { get; set; } = false;
    public bool AnalyzeThirdPartyContainers { get; set; } = false;
    public string[] ThirdPartyContainerPatterns { get; set; } = ["Autofac", "Ninject", "Castle.Windsor"];
}

public enum OutputFormat
{
    Json,
    Xml,
    Csv
}