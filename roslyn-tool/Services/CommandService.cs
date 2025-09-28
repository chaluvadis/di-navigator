namespace DIServiceAnalyzer.Services;

public class CommandService(IAnalyzerService analyzerService) : ICommandService
{
    private readonly IAnalyzerService _analyzerService
        = analyzerService ?? throw new ArgumentNullException(nameof(analyzerService));
    public async Task<int> RunAsync(string[] args)
        => await CreateRootCommand().InvokeAsync(args);
    private RootCommand CreateRootCommand()
    {
        var rootCommand = new RootCommand("Analyzes .NET solutions to identify service registries and dependency injection configurations.");

        var inputOption = new Option<string>("--input", "Input directory or solution file (.sln/.slnx) to analyze. If not provided, uses current directory.")
        {
            IsRequired = false
        };
        inputOption.AddAlias("-i");

        var helpOption = new Option<bool>("--help", "Show help information.")
        {
            IsRequired = false
        };
        helpOption.AddAlias("-h");

        rootCommand.AddOption(inputOption);
        rootCommand.AddOption(helpOption);

        rootCommand.SetHandler(async (input, help) => await HandleAnalyzeAsync(input), inputOption, helpOption);

        return rootCommand;
    }
    private async Task HandleAnalyzeAsync(string input)
    {
        try
        {
            var analysisResult = await _analyzerService.AnalyzeSolutionsAsync(input);
            Console.WriteLine(JsonSerializer.Serialize(analysisResult));
            if (analysisResult == null || analysisResult.Projects.Count == 0)
            {
                return;
            }
        }
        catch
        {
            throw;
        }
    }
}