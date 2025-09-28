using Microsoft.Extensions.DependencyInjection;

public class DebugFactoryTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // This is the user's example that should show "AddOpenApi" not "FactoryMethod"
        services.AddOpenApi(options =>
        {
            // Some configuration
        });
    }
}