using Microsoft.Extensions.DependencyInjection;

public class UserOriginalExample
{
    public void ConfigureServices(IServiceCollection services)
    {
        // User's exact example
        services.AddScoped<UserSystemMonitoringService>();
        services.AddScoped<IUserSystemMonitoringService>(sp => sp.GetRequiredService<UserSystemMonitoringService>());
    }
}

public interface IUserSystemMonitoringService { }
public class UserSystemMonitoringService : IUserSystemMonitoringService { }