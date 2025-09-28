namespace DIServiceAnalyzer.Interfaces;

public interface IProgressReporter
{
    void ReportProgress(int percentage, string message);
    void ReportStatus(string status);
    bool IsCancellationRequested { get; }
    void Cancel();
}

public class ProgressReporter : IProgressReporter, IDisposable
{
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private int _lastReportedPercentage = -1;

    public void ReportProgress(int percentage, string message)
    {
        if (percentage < 0 || percentage > 100)
            return;

        if (percentage == _lastReportedPercentage)
            return;

        _lastReportedPercentage = percentage;

        Console.WriteLine($"[{percentage}%] {message}");
    }

    public void ReportStatus(string status)
    {
        Console.WriteLine($"Status: {status}");
    }

    public bool IsCancellationRequested => _cancellationTokenSource.Token.IsCancellationRequested;

    public void Cancel()
    {
        _cancellationTokenSource.Cancel();
    }

    public CancellationToken GetCancellationToken() => _cancellationTokenSource.Token;

    public void Dispose()
    {
        _cancellationTokenSource.Dispose();
    }
}