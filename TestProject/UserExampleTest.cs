using Microsoft.Extensions.DependencyInjection;

public class UserExampleTest
{
    public void ConfigureServices(IServiceCollection services)
    {
        // This is the user's exact example that has the issue
        services.AddScoped<UserExampleService>();
        services.AddScoped<IUserExampleService>(sp => sp.GetRequiredService<UserExampleService>());
    }
}

public interface IUserExampleService { }
public class UserExampleService : IUserExampleService { }