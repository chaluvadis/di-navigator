using Microsoft.Extensions.DependencyInjection;

public class Program
{
    public static void Main()
    {
        var services = new ServiceCollection();
        services.AddScoped<IUserService, UserService>();
        services.AddSingleton<ILogger, ConsoleLogger>();
        services.AddTransient<IRepo, SqlRepo>();
    }
}

public interface IUserService { }
public class UserService : IUserService
{
    private readonly ILogger _logger;
    private readonly IRepo _repo;

    public UserService(ILogger logger, IRepo repo)
    {
        _logger = logger;
        _repo = repo;
    }
}

public interface ILogger { }
public class ConsoleLogger : ILogger { }

public interface IRepo { }
public class SqlRepo : IRepo { }