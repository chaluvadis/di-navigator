var serviceProvider = new ServiceCollection()
    .AddAnalyzerServices()
    .BuildServiceProvider();

var cli = serviceProvider.GetRequiredService<ICommandService>();

await cli.RunAsync([
    "--input",
    "../test-project/TestProject"
]);