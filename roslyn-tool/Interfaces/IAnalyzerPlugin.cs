using DIServiceAnalyzer.Models;

namespace DIServiceAnalyzer.Interfaces;

public interface IAnalyzerPlugin
{
    string Name { get; }
    string Version { get; }
    string Description { get; }

    Task InitializeAsync(Models.AnalyzerConfig config, ILogger logger);
    Task<List<ServiceRegistration>> AnalyzeProjectAsync(ProjectAnalysis project, CancellationToken cancellationToken = default);
    Task<List<CustomRegistry>> DetectCustomRegistriesAsync(ProjectAnalysis project, CancellationToken cancellationToken = default);
    Task<List<ServiceLifetimeConflict>> AnalyzeLifetimeConflictsAsync(List<ProjectAnalysis> projects, CancellationToken cancellationToken = default);
    bool CanHandleProject(string projectType);
}

public abstract class AnalyzerPluginBase : IAnalyzerPlugin
{
    public abstract string Name { get; }
    public abstract string Version { get; }
    public abstract string Description { get; }

    protected ILogger? Logger { get; private set; }
    protected Models.AnalyzerConfig? Config { get; private set; }

    public virtual Task InitializeAsync(Models.AnalyzerConfig config, ILogger logger)
    {
        Config = config;
        Logger = logger;
        return Task.CompletedTask;
    }

    public abstract Task<List<ServiceRegistration>> AnalyzeProjectAsync(ProjectAnalysis project, CancellationToken cancellationToken = default);
    public abstract Task<List<CustomRegistry>> DetectCustomRegistriesAsync(ProjectAnalysis project, CancellationToken cancellationToken = default);
    public abstract Task<List<ServiceLifetimeConflict>> AnalyzeLifetimeConflictsAsync(List<ProjectAnalysis> projects, CancellationToken cancellationToken = default);
    public abstract bool CanHandleProject(string projectType);

    protected void LogDebug(string message) => Logger?.LogDebug(message);
    protected void LogInfo(string message) => Logger?.LogInfo(message);
    protected void LogWarning(string message) => Logger?.LogWarning(message);
    protected void LogError(string message, Exception? exception = null) => Logger?.LogError(message, exception);
}