using Microsoft.Extensions.DependencyInjection;

public class SimpleLambdaTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // This uses Configure with lambda - similar to the user's issue
        services.Configure<SimpleOptions>(options =>
        {
            options.Value = "test";
        });

        // Regular registration should still work
        services.AddTransient<ISimpleService, SimpleService>();
    }
}

public class SimpleOptions
{
    public string Value { get; set; } = string.Empty;
}

public interface ISimpleService { }
public class SimpleService : ISimpleService { }