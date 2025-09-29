using Microsoft.Extensions.DependencyInjection;

public class FactoryRegistrationTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // This is the problematic case that was showing "AddScoped" instead of proper types
        services.AddScoped<ISystemMonitoringService>(sp => sp.GetRequiredService<SystemMonitoringService>());
        services.AddScoped<CoreMonitoring.ISystemMonitoringService>(sp => sp.GetRequiredService<CoreMonitoring.SystemMonitoringService>());
    }
}

public interface ISystemMonitoringService { }
public class SystemMonitoringService : ISystemMonitoringService { }

namespace CoreMonitoring
{
    public interface ISystemMonitoringService { }
    public class SystemMonitoringService : ISystemMonitoringService { }
}