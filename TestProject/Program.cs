using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

// See https://aka.ms/new-console-template for more information
Console.WriteLine("Hello, World!");

// Test different service lifetimes including AddCors and AddHttpClient
var host = Host.CreateDefaultBuilder(args)
    .ConfigureServices(services =>
    {
        // Singleton service
        services.AddSingleton<IUserService, UserService>();

        // Scoped services
        services.AddScoped<IMyService, MyService>();
        services.AddScoped<ISingletonService, SingletonService>();

        // Transient service
        services.AddTransient<IMyService, MyService>(); // This will create a conflict to test

        // Services that should appear under "Others" - simplified for testing
        // These would normally require additional packages, but we're testing detection

        // Test lambda expressions as mentioned in the issue
        // Using types that exist in the project
        services.AddSingleton<IMyService>(sp => new MyService());
        services.AddScoped<ISingletonService>(sp => new SingletonService());

        // Test the specific case mentioned by the user
        // This simulates: services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
        services.AddSingleton<IMyService>(sp => sp.GetRequiredService<IMyService>());

        // Add the user's specific example that should show "AddSingleton" not "FactoryMethod"
        services.AddSingleton<INotificationService>(options =>
        {
            // Simulate the user's AddOpenApi example
            // This should be detected as a factory method and use "AddSingleton" as the service name
            return new NotificationService();
        });

        // Add the user's specific problematic case
        services.AddScoped<IMyService>(sp => sp.GetRequiredService<IMyService>());
        services.AddScoped<ISingletonService>(sp => sp.GetRequiredService<ISingletonService>());
    })
    .Build();

Console.WriteLine("Services registered successfully!");

public interface INotificationService { }
public class NotificationService : INotificationService { }
