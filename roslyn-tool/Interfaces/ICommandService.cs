namespace DIServiceAnalyzer.Interfaces;

public interface ICommandService
{
    Task<int> RunAsync(string[] args);
}