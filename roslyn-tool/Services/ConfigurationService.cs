namespace DIServiceAnalyzer.Services;

public class ConfigurationService : IConfigurationService
{
    private Models.AnalyzerConfig _config = new();
    private readonly string _configPath;

    public ConfigurationService(string configPath = "appsettings.json")
    {
        _configPath = configPath;
        LoadConfiguration(configPath);
    }

    public Models.AnalyzerConfig GetConfiguration() => _config;

    public void LoadConfiguration(string configPath = "appsettings.json")
    {
        try
        {
            if (File.Exists(configPath))
            {
                var jsonContent = File.ReadAllText(configPath);
                var loadedConfig = JsonSerializer.Deserialize<Models.AnalyzerConfig>(jsonContent);

                if (loadedConfig != null)
                {
                    _config = loadedConfig;
                }
            }
            else
            {
                // Create default configuration file
                SaveConfiguration(configPath);
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Failed to load configuration from {configPath}: {ex.Message}");
            Console.WriteLine("Using default configuration.");
        }
    }

    public void SaveConfiguration(string configPath = "appsettings.json")
    {
        try
        {
            var jsonContent = JsonSerializer.Serialize(_config, new JsonSerializerOptions
            {
                WriteIndented = true
            });

            File.WriteAllText(configPath, jsonContent);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error saving configuration to {configPath}: {ex.Message}");
        }
    }

    public void UpdateConfiguration(Models.AnalyzerConfig config)
    {
        _config = config;
        SaveConfiguration(_configPath);
    }
}