namespace DIServiceAnalyzer.Interfaces;

public interface IPluginManager
{
    Task LoadPluginsAsync(string pluginDirectory);
    Task InitializePluginsAsync(Models.AnalyzerConfig config, ILogger logger);
    List<IAnalyzerPlugin> GetPluginsForProject(string projectType);
    List<IAnalyzerPlugin> GetAllPlugins();
    Task UnloadPluginsAsync();
}

public class PluginManager : IPluginManager
{
    private readonly List<IAnalyzerPlugin> _plugins = new();
    private readonly ILogger _logger;

    public PluginManager(ILogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task LoadPluginsAsync(string pluginDirectory)
    {
        try
        {
            if (!Directory.Exists(pluginDirectory))
            {
                _logger.LogInfo($"Plugin directory does not exist: {pluginDirectory}");
                return;
            }

            var pluginFiles = Directory.GetFiles(pluginDirectory, "*.dll", SearchOption.AllDirectories);

            foreach (var pluginFile in pluginFiles)
            {
                try
                {
                    await LoadPluginFromFileAsync(pluginFile);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"Failed to load plugin from {pluginFile}: {ex.Message}");
                }
            }

            _logger.LogInfo($"Loaded {_plugins.Count} plugins from {pluginDirectory}");
        }
        catch (Exception ex)
        {
            _logger.LogError($"Error loading plugins from {pluginDirectory}", ex);
        }
    }

    public async Task InitializePluginsAsync(Models.AnalyzerConfig config, ILogger logger)
    {
        foreach (var plugin in _plugins)
        {
            try
            {
                await plugin.InitializeAsync(config, logger);
                _logger.LogDebug($"Initialized plugin: {plugin.Name} v{plugin.Version}");
            }
            catch (Exception ex)
            {
                _logger.LogError($"Failed to initialize plugin {plugin.Name}", ex);
            }
        }
    }

    public List<IAnalyzerPlugin> GetPluginsForProject(string projectType)
    {
        return _plugins.Where(p => p.CanHandleProject(projectType)).ToList();
    }

    public List<IAnalyzerPlugin> GetAllPlugins()
    {
        return _plugins.ToList();
    }

    public async Task UnloadPluginsAsync()
    {
        _plugins.Clear();
        _logger.LogInfo("All plugins unloaded");
    }

    private async Task LoadPluginFromFileAsync(string pluginFile)
    {
        // In a real implementation, this would use reflection to load the DLL
        // and instantiate plugins. For now, we'll create a placeholder.

        _logger.LogDebug($"Loading plugin from: {pluginFile}");

        // This is a simplified version. In production, you would:
        // 1. Load the assembly using Assembly.LoadFrom
        // 2. Find types that implement IAnalyzerPlugin
        // 3. Instantiate them using Activator.CreateInstance
        // 4. Handle assembly dependencies and versioning

        // For demonstration, we'll just log that the plugin would be loaded
        _logger.LogInfo($"Plugin file found: {Path.GetFileName(pluginFile)}");
    }
}