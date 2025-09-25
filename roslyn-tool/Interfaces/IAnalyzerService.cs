namespace DIServiceAnalyzer.Interfaces;

public interface IAnalyzerService
{
    Task<AnalysisResult> AnalyzeSolutionsAsync(string inputDirectory);
    Task<AnalysisResult> AnalyzeSingleSolutionAsync(string solutionPath);
}