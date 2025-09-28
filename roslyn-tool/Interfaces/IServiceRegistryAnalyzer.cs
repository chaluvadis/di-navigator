namespace DIServiceAnalyzer.Interfaces;

public interface IServiceRegistryAnalyzer
{
    List<ServiceRegistration> AnalyzeServiceRegistrations(string sourceCode, string filePath);
    List<CustomRegistry> DetectCustomRegistries(string sourceCode, string filePath);
}