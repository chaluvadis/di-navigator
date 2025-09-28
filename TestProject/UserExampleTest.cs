using Microsoft.Extensions.DependencyInjection;

public class UserExampleTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // User's first example
        services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);

        // User's second example
        services.AddQuartz(q =>
        {
            q.UseSimpleTypeLoader();
            q.UseInMemoryStore();
            q.UseDefaultThreadPool(tp => tp.MaxConcurrency = 10);
        });
    }
}