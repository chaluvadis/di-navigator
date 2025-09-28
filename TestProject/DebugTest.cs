using Microsoft.Extensions.DependencyInjection;

namespace DebugTestNamespace
{
    public static class DebugTestExtensions
    {
        public static void ConfigureDebugServices(this IServiceCollection services)
        {
            // Test case 1: builder.Services.AddWorkflowOrchestratorDatabase(builder.Configuration)
            services.AddWorkflowOrchestratorDatabase(null); // Simplified for testing

            // Test case 2: builder.Services.AddWorkflowOrchestratorCore(builder.Configuration)
            services.AddWorkflowOrchestratorCore(null); // Simplified for testing

            // Test case 3: builder.Services.AddOpenApi(options => { ... })
            services.AddOpenApi(options => { }); // Simplified for testing

            // Test case 4: builder.Services.AddCors(options => { ... })
            services.AddCors(options => { }); // Simplified for testing

            // Test case 5: Regular service for comparison
            services.AddTransient<IDebugService, DebugService>();
        }
    }

    // Extension methods to simulate the user's examples
    public static class DebugMethodExtensions
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

    public interface IDebugService { }
    public class DebugService : IDebugService { }
}