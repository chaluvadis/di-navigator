namespace DIServiceAnalyzer.Interfaces;

public interface ILogger
{
    void LogDebug(string message);
    void LogInfo(string message);
    void LogWarning(string message);
    void LogError(string message, Exception? exception = null);
    void LogCritical(string message, Exception? exception = null);
    bool IsEnabled(LogLevel level);
    IDisposable BeginScope(string scope);
}

public enum LogLevel
{
    Debug,
    Info,
    Warning,
    Error,
    Critical
}