namespace DIServiceAnalyzer.Exceptions;

public class AnalysisException : Exception
{
    public string? FilePath { get; protected set; }
    public int? LineNumber { get; protected set; }
    public string? ProjectName { get; protected set; }

    public AnalysisException(string message) : base(message) { }

    public AnalysisException(string message, Exception innerException) : base(message, innerException) { }

    public AnalysisException(string message, string filePath, int? lineNumber = null)
        : base(message)
    {
        FilePath = filePath;
        LineNumber = lineNumber;
    }

    public AnalysisException(string message, string filePath, int? lineNumber, Exception innerException)
        : base(message, innerException)
    {
        FilePath = filePath;
        LineNumber = lineNumber;
    }

    public AnalysisException(string message, string filePath, string projectName, int? lineNumber = null)
        : base(message)
    {
        FilePath = filePath;
        ProjectName = projectName;
        LineNumber = lineNumber;
    }

    public AnalysisException(string message, string filePath, string projectName, Exception innerException)
        : base(message, innerException)
    {
        FilePath = filePath;
        ProjectName = projectName;
    }
}

public class ProjectNotFoundException : AnalysisException
{
    public ProjectNotFoundException(string projectPath)
        : base($"Project file not found: {projectPath}", projectPath) { }
}

public class SolutionNotFoundException : AnalysisException
{
    public SolutionNotFoundException(string solutionPath)
        : base($"Solution file not found: {solutionPath}", solutionPath) { }
}

public class ServiceRegistrationException : AnalysisException
{
    public ServiceRegistrationException(string message, string filePath, int lineNumber)
        : base(message, filePath, lineNumber) { }
}

public class ProjectParsingException : AnalysisException
{
    public ProjectParsingException(string message, string projectPath, Exception innerException)
        : base(message, innerException)
    {
        FilePath = projectPath;
    }
}