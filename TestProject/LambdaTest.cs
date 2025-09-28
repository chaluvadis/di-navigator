using Microsoft.Extensions.DependencyInjection;
using Quartz;

public class LambdaTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // Test case 1: Simple lambda with property assignment
        services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);

        // Test case 2: Complex lambda with multiple configuration calls
        services.AddQuartz(q =>
        {
            q.UseSimpleTypeLoader();
            q.UseInMemoryStore();
            q.UseDefaultThreadPool(tp => tp.MaxConcurrency = 10);
        });

        // Test case 3: Regular service registration (should still work)
        services.AddTransient<IUserService, UserService>();

        // Test case 4: Factory method registration (should still work)
        services.AddTransient<IService>(sp => new Service());
    }
}

public interface IUserService { }
public class UserService : IUserService { }
public interface IService { }
public class Service : IService { }