namespace DIServiceAnalyzer.Services;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddAnalyzerServices(this IServiceCollection services)
    {
        services.AddTransient<IServiceRegistryAnalyzer, ServiceRegistryAnalyzer>();
        services.AddTransient<IProjectAnalyzer, ProjectAnalyzer>();
        services.AddTransient<IStartupAnalyzer, StartupAnalyzer>();
        services.AddTransient<IAnalyzerService, AnalyzerService>();
        services.AddTransient<ICommandService, CommandService>();
        services.AddTransient<ILogger, ConsoleLogger>();
        services.AddTransient<IConfigurationService, ConfigurationService>();
        services.AddTransient<IProgressReporter, ProgressReporter>();
        services.AddTransient<ICacheService, CacheService>();
        services.AddTransient<IServiceLifetimeAnalyzer, ServiceLifetimeAnalyzer>();
        services.AddTransient<IPluginManager, PluginManager>();
        return services;
    }
}