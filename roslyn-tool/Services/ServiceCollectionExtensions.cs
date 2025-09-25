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
        return services;
    }
}