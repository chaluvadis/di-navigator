using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace TestProject;

public interface IUserService
{
    string GetUserName();
}

public interface IOrderService
{
    void ProcessOrder(int orderId);
}

public class UserService : IUserService
{
    public string GetUserName() => "Test User";
}

public class OrderService : IOrderService
{
    private readonly IUserService _userService;

    public OrderService(IUserService userService)
    {
        _userService = userService;
    }

    public void ProcessOrder(int orderId)
    {
        Console.WriteLine($"Processing order {orderId} for {_userService.GetUserName()}");
    }
}

public class AdminService
{
    private readonly IOrderService _orderService;

    public AdminService(IOrderService orderService)
    {
        _orderService = orderService;
    }

    public void DoAdminWork()
    {
        _orderService.ProcessOrder(123);
    }
}

public class Program
{
    public static void Main(string[] args)
    {
        var host = Host.CreateDefaultBuilder(args)
            .ConfigureServices((context, services) =>
            {
                // Singleton registration
                services.AddSingleton<IUserService, UserService>();

                // Scoped registration
                services.AddScoped<IOrderService, OrderService>();

                // Transient registration
                services.AddTransient<AdminService>();

                // Factory registration
                services.AddTransient<IUserService>(provider =>
                    new UserService());

                // Another singleton
                services.AddSingleton<IOrderService>(provider =>
                {
                    var userService = provider.GetRequiredService<IUserService>();
                    return new OrderService(userService);
                });
            })
            .Build();

        var adminService = host.Services.GetRequiredService<AdminService>();
        adminService.DoAdminWork();

        Console.WriteLine("DI Analysis Test Complete");
    }
}