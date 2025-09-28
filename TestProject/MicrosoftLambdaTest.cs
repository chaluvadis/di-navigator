using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

public class MicrosoftLambdaTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // Test case 1: Configure with lambda - similar pattern to Quartz
        // This should extract "Configure" as method name, not lambda content
        services.Configure<TestOptions>(options => options.Setting1 = "test");

        // Test case 2: AddHttpClient with lambda configuration
        // This should extract "AddHttpClient" as method name
        services.AddHttpClient("testClient", client =>
        {
            client.BaseAddress = new Uri("https://api.example.com");
            client.Timeout = TimeSpan.FromSeconds(30);
        });

        // Test case 3: Configure with complex lambda
        services.Configure<ComplexOptions>(options =>
        {
            options.DatabaseConnection = "connectionString";
            options.RetryCount = 3;
            options.EnableCaching = true;
        });

        // Test case 4: Regular registration should still work
        services.AddTransient<ILambdaTestService, LambdaTestService>();
    }
}

public class TestOptions
{
    public string Setting1 { get; set; } = string.Empty;
}

public class ComplexOptions
{
    public string DatabaseConnection { get; set; } = string.Empty;
    public int RetryCount { get; set; }
    public bool EnableCaching { get; set; }
}

public interface ILambdaTestService { }
public class LambdaTestService : ILambdaTestService { }