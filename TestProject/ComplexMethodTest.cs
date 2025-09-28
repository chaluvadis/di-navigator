using Microsoft.Extensions.DependencyInjection;

public static class ComplexMethodTestExtensions
{
    public static void ConfigureComplexServices(this IServiceCollection services)
    {
        // Test case 1: builder.Services.AddWorkflowOrchestratorDatabase(builder.Configuration)
        // This should extract "AddWorkflowOrchestratorDatabase" as method name
        services.AddWorkflowOrchestratorDatabase(null); // Simplified for testing

        // Test case 2: builder.Services.AddWorkflowOrchestratorCore(builder.Configuration)
        // This should extract "AddWorkflowOrchestratorCore" as method name
        services.AddWorkflowOrchestratorCore(null); // Simplified for testing

        // Test case 3: builder.Services.AddOpenApi(options => { ... })
        // This should extract "AddOpenApi" as method name
        services.AddOpenApi(options => { }); // Simplified for testing

        // Test case 4: builder.Services.AddCors(options => { ... })
        // This should extract "AddCors" as method name
        services.AddCors(options => { }); // Simplified for testing
    }
}

// Extension methods to simulate the user's examples
public static class ComplexTestExtensions
{
    public static void AddWorkflowOrchestratorDatabase(this IServiceCollection services, object configuration)
    {
        // Simulate the method
    }

    public static void AddWorkflowOrchestratorCore(this IServiceCollection services, object configuration)
    {
        // Simulate the method
    }

    public static void AddOpenApi(this IServiceCollection services, Action<object> configure)
    {
        // Simulate the method
    }

    public static void AddCors(this IServiceCollection services, Action<object> configure)
    {
        // Simulate the method
    }
}