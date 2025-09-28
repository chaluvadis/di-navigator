namespace DIServiceAnalyzer.Interfaces;

public interface ICacheService
{
    Task<T?> GetAsync<T>(string key);
    Task SetAsync<T>(string key, T value, TimeSpan? expiration = null);
    Task RemoveAsync(string key);
    Task ClearAsync();
    bool IsEnabled { get; }
}

public class CacheService : ICacheService
{
    private readonly Dictionary<string, CacheEntry> _cache = new();
    private readonly object _lock = new();
    private readonly TimeSpan _defaultExpiration;

    public CacheService(TimeSpan defaultExpiration = default)
    {
        _defaultExpiration = defaultExpiration == default ? TimeSpan.FromMinutes(30) : defaultExpiration;
        IsEnabled = true;
    }

    public bool IsEnabled { get; private set; }

    public async Task<T?> GetAsync<T>(string key)
    {
        if (!IsEnabled)
            return default;

        lock (_lock)
        {
            if (_cache.TryGetValue(key, out var entry))
            {
                if (entry.Expiration > DateTime.UtcNow)
                {
                    return (T)entry.Value;
                }
                else
                {
                    _cache.Remove(key);
                }
            }
        }

        return default;
    }

    public async Task SetAsync<T>(string key, T value, TimeSpan? expiration = null)
    {
        if (!IsEnabled)
            return;

        var expiresAt = DateTime.UtcNow.Add(expiration ?? _defaultExpiration);

        lock (_lock)
        {
            _cache[key] = new CacheEntry
            {
                Value = value,
                Expiration = expiresAt
            };
        }
    }

    public async Task RemoveAsync(string key)
    {
        lock (_lock)
        {
            _cache.Remove(key);
        }
    }

    public async Task ClearAsync()
    {
        lock (_lock)
        {
            _cache.Clear();
        }
    }

    private class CacheEntry
    {
        public object Value { get; set; } = default!;
        public DateTime Expiration { get; set; }
    }
}