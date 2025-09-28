using DIServiceAnalyzer.Models;

namespace DIServiceAnalyzer.Interfaces;

public interface IConfigurationService
{
    Models.AnalyzerConfig GetConfiguration();
    void LoadConfiguration(string configPath = "appsettings.json");
    void SaveConfiguration(string configPath = "appsettings.json");
    void UpdateConfiguration(Models.AnalyzerConfig config);
}