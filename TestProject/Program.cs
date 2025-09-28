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
        services.AddScoped<IOrderService, OrderService>();
        services.AddScoped<IEmailService, EmailService>();

        // Transient service
        services.AddTransient<IOrderService, OrderService>(); // This will create a conflict to test

        // Services that should appear under "Others" - simplified for testing
        // These would normally require additional packages, but we're testing detection

        // Test lambda expressions as mentioned in the issue
        // Using types that exist in the project
        services.AddSingleton<IUserService>(sp => new UserService());
        services.AddScoped<IOrderService>(sp => new OrderService());

        // Test the specific case mentioned by the user
        // This simulates: services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
        services.AddSingleton<IUserService>(sp => sp.GetRequiredService<IUserService>());

        // Add the user's specific example that should show "AddSingleton" not "FactoryMethod"
        services.AddSingleton<INotificationService>(options =>
        {
            // Simulate the user's AddOpenApi example
            // This should be detected as a factory method and use "AddSingleton" as the service name
            return new NotificationService();
        });
    })
    .Build();

Console.WriteLine("Services registered successfully!");

public interface IUserService { }
public interface IOrderService { }
public interface IEmailService { }
public interface INotificationService { }

public class UserService : IUserService { }
public class OrderService : IOrderService { }
public class EmailService : IEmailService { }
public class NotificationService : INotificationService { }
