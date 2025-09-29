using Microsoft.Extensions.DependencyInjection;

public class SimpleFactoryTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // Test the user's specific problematic case
        services.AddScoped<IFactoryTestService>(sp => sp.GetRequiredService<FactoryTestService>());
        services.AddScoped<ICoreFactoryService>(sp => sp.GetRequiredService<CoreFactoryService>());
    }
}

public interface IFactoryTestService { }
public class FactoryTestService : IFactoryTestService { }

public interface ICoreFactoryService { }
public class CoreFactoryService : ICoreFactoryService { }