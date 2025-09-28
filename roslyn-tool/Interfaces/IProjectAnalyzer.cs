namespace DIServiceAnalyzer.Interfaces;

public interface IProjectAnalyzer
{
    ProjectMetadata AnalyzeProject(string projectPath);
    List<string> GetSourceFiles(string projectPath);
}