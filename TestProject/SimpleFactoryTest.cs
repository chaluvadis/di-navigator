using Microsoft.Extensions.DependencyInjection;

public class SimpleFactoryTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // This should show as "Others -- AddCors" not "Others -- FactoryMethod -- AddCors"
        services.AddCors(options =>
        {
            options.AddPolicy(
                "AllowAll",
                policy =>
                {
                    policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
                }
            );
        });

        // This should show as "Others -- AddOpenApi" not "Others -- FactoryMethod -- AddOpenApi"
        services.AddOpenApi(options =>
        {
            // Some configuration
        });

        // Regular service registration should still work
        services.AddTransient<IMyService, MyService>();
    }
}

public interface IMyService { }
public class MyService : IMyService { }