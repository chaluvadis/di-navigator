namespace DIServiceAnalyzer.Interfaces;

public interface IConstructorAnalyzer
{
    /// <summary>
    /// Analyzes constructor parameters in source code to identify dependency injection patterns
    /// </summary>
    /// <param name="sourceCode">The source code to analyze</param>
    /// <param name="filePath">Path to the source file</param>
    /// <returns>List of injected dependencies found in constructors</returns>
    List<ConstructorAnalysis> AnalyzeConstructorInjections(string sourceCode, string filePath);

    /// <summary>
    /// Extracts all constructor parameters from a class
    /// </summary>
    /// <param name="sourceCode">The source code containing the class</param>
    /// <param name="className">Name of the class to analyze</param>
    /// <param name="filePath">Path to the source file</param>
    /// <returns>Constructor analysis with parameter details</returns>
    ConstructorAnalysis AnalyzeClassConstructors(string sourceCode, string className, string filePath);
}