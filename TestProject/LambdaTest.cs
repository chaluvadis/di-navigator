using Microsoft.Extensions.DependencyInjection;

public static class LambdaTestExtensions
{
    public static void ConfigureServicesWithLambdas(this IServiceCollection services)
    {
        // Test case 1: Simple lambda with GetRequiredService
        services.AddSingleton<IService>(sp =>
            sp.GetRequiredService<ISchedulerFactory>()
        );

        // Test case 2: Complex lambda with method chaining (the user's issue)
        services.AddSingleton(sp =>
            sp.GetRequiredService<ISchedulerFactory>().GetScheduler().GetAwaiter().GetResult()
        );

        // Test case 3: Lambda with GetService instead of GetRequiredService
        services.AddScoped<IOtherService>(sp =>
            sp.GetService<IService>()
        );

        // Test case 4: Regular service registration for comparison
        services.AddTransient<ISimpleService, SimpleService>();
    }
}

public interface IService { }
public interface ISchedulerFactory { }
public interface IOtherService { }
public interface ISimpleService { }

public class SimpleService : ISimpleService { }