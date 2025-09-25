namespace DIServiceAnalyzer.Interfaces;

public interface IStartupAnalyzer
{
    List<StartupConfiguration> AnalyzeStartupFiles(List<string> sourceFiles);
    List<CustomRegistry> DetectCustomRegistries(List<string> sourceFiles);
    List<ServiceRegistration> FindAllServiceRegistrations(List<string> sourceFiles);
}