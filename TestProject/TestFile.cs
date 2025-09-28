using Microsoft.Extensions.DependencyInjection;

public static class TestExtensions
{
    public static void ConfigureServices(this IServiceCollection services)
    {
        // These should now be detected by the Roslyn tool and appear under "Others"
        // Using a try-catch to handle missing references gracefully
        try { services.AddCors(); } catch { }
        try { services.AddHttpClient(); } catch { }

        // Regular services for comparison
        services.AddScoped<IMyService, MyService>();
        services.AddSingleton<ISingletonService, SingletonService>();
        services.AddTransient<ITransientService, TransientService>();
    }
}

public interface IMyService { }
public interface ISingletonService { }
public interface ITransientService { }

public class MyService : IMyService { }
public class SingletonService : ISingletonService { }
public class TransientService : ITransientService { }