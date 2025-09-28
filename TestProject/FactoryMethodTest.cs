using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.AspNetCore.OpenAPI;

public class FactoryMethodTest
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
            options.OpenApiVersion = OpenApiSpecVersion.OpenApi3_1;
        });

        // Regular service registration should still work
        services.AddTransient<IService, Service>();
    }
}

public interface IService { }
public class Service : IService { }