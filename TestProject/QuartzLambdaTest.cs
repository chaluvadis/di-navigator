using Microsoft.Extensions.DependencyInjection;

public class QuartzLambdaTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // Test case 1: This should extract "AddQuartzHostedService" as method name
        // Previously it was extracting "q.WaitForJobsToComplete" from the lambda body
        services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);

        // Test case 2: This should extract "AddQuartz" as method name
        // Previously it was showing "FactoryMethod"
        services.AddQuartz(q =>
        {
            q.UseSimpleTypeLoader();
            q.UseInMemoryStore();
            q.UseDefaultThreadPool(tp => tp.MaxConcurrency = 10);
        });

        // Test case 3: Regular registration should still work
        services.AddTransient<IMyTestService, MyTestService>();
    }
}

public interface IMyTestService { }
public class MyTestService : IMyTestService { }