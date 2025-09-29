var serviceProvider = new ServiceCollection()
    .AddAnalyzerServices()
    .BuildServiceProvider();

var cli = serviceProvider.GetRequiredService<ICommandService>();

// Use command line arguments if provided, otherwise use default
var commandLineArgs = Environment.GetCommandLineArgs().Skip(1).ToArray();
var defaultArgs = new[] { "--input", "../test-project/TestProject" };
var argsToUse = commandLineArgs.Length > 0 ? commandLineArgs : defaultArgs;

await cli.RunAsync(argsToUse);