using DIServiceAnalyzer.Interfaces;

namespace DIServiceAnalyzer.Services;

public class ConsoleLogger(LogLevel minLevel = LogLevel.Info) : ILogger, IDisposable
{
    private readonly LogLevel _minLevel = minLevel;
    private readonly object _lock = new();
    private readonly Stack<string> _scopes = new();

    public void LogDebug(string message) => Log(LogLevel.Debug, message);
    public void LogInfo(string message) => Log(LogLevel.Info, message);
    public void LogWarning(string message) => Log(LogLevel.Warning, message);
    public void LogError(string message, Exception? exception = null) => Log(LogLevel.Error, message, exception);
    public void LogCritical(string message, Exception? exception = null) => Log(LogLevel.Critical, message, exception);

    public bool IsEnabled(LogLevel level) => level >= _minLevel;

    public IDisposable BeginScope(string scope)
    {
        _scopes.Push(scope);
        return new ScopeDisposer(this);
    }

    private void Log(LogLevel level, string message, Exception? exception = null)
    {
        if (!IsEnabled(level))
            return;

        lock (_lock)
        {
            var timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            var levelName = level.ToString().ToUpper();
            var scope = _scopes.Count > 0 ? $"[{string.Join("][", _scopes.Reverse())}] " : "";

            var fullMessage = $"{timestamp} [{levelName}] {scope}{message}";

            var consoleColor = level switch
            {
                LogLevel.Debug => ConsoleColor.Gray,
                LogLevel.Info => ConsoleColor.White,
                LogLevel.Warning => ConsoleColor.Yellow,
                LogLevel.Error => ConsoleColor.Red,
                LogLevel.Critical => ConsoleColor.DarkRed,
                _ => ConsoleColor.White
            };

            var originalColor = Console.ForegroundColor;
            Console.ForegroundColor = consoleColor;
            Console.WriteLine(fullMessage);
            Console.ForegroundColor = originalColor;

            if (exception != null)
            {
                Console.ForegroundColor = ConsoleColor.DarkGray;
                Console.WriteLine($"  Exception: {exception.Message}");
                Console.WriteLine($"  StackTrace: {exception.StackTrace}");
                Console.ForegroundColor = originalColor;
            }
        }
    }

    public void Dispose()
    {
        _scopes.Clear();
    }

    private class ScopeDisposer : IDisposable
    {
        private readonly ConsoleLogger _logger;

        public ScopeDisposer(ConsoleLogger logger)
        {
            _logger = logger;
        }

        public void Dispose()
        {
            if (_logger._scopes.Count > 0)
                _logger._scopes.Pop();
        }
    }
}