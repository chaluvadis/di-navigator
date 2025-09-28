using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

public class ValidLambdaTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // Test case 1: Configure with lambda - similar pattern to user's issue
        // This should extract "Configure" as method name, not lambda content
        services.Configure<TestOptions>(options =>
        {
            options.Setting1 = "test";
            options.Setting2 = 42;
        });

        // Test case 2: AddHostedService with lambda-like usage
        services.AddHostedService(provider =>
        {
            return new TestHostedService();
        });

        // Test case 3: Configure with complex lambda (similar to user's Quartz example)
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
    public int Setting2 { get; set; }
}

public class ComplexOptions
{
    public string DatabaseConnection { get; set; } = string.Empty;
    public int RetryCount { get; set; }
    public bool EnableCaching { get; set; }
}

public class TestHostedService : BackgroundService
{
    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        return Task.CompletedTask;
    }
}

public interface ILambdaTestService { }
public class LambdaTestService : ILambdaTestService { }