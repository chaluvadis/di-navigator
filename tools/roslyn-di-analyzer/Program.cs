using System.CommandLine;
using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.Extensions.DependencyInjection;

namespace roslyn_di_analyzer;

class Program
{
    public class Registration
    {
        public string Lifetime { get; set; } = string.Empty;
        public string ServiceType { get; set; } = string.Empty;
        public string ImplementationType { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string MethodCall { get; set; } = string.Empty;
    }

    public class InjectionSite
    {
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; }
        public string ClassName { get; set; } = string.Empty;
        public string MemberName { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string ServiceType { get; set; } = string.Empty;
    }

    public class AnalysisResult
    {
        public List<Registration> Registrations { get; set; } = new();
        public List<InjectionSite> InjectionSites { get; set; } = new();
    }

    static async Task<int> Main(string[] args)
    {
        var fileOption = new Option<FileInfo?>(
            name: "--file",
            description: "The C# file to analyze.")
        { IsRequired = true };

        var rootCommand = new RootCommand("Roslyn-based DI analyzer for C# files");
        rootCommand.AddOption(fileOption);

        rootCommand.SetHandler(async (file) =>
        {
            if (file == null)
            {
                Console.WriteLine("No file provided.");
                return;
            }

            var result = await AnalyzeFile(file.FullName);
            var json = JsonSerializer.Serialize(result);
            Console.WriteLine(json);
        }, fileOption);

        return await rootCommand.InvokeAsync(args);
    }

    [RequiresAssemblyFiles("Calls System.Reflection.Assembly.Location")]
    static async Task<AnalysisResult> AnalyzeFile(string filePath)
    {
        var result = new AnalysisResult();
        var code = await File.ReadAllTextAsync(filePath);
        var tree = CSharpSyntaxTree.ParseText(code);
        var compilation = CSharpCompilation.Create("Analysis")
            .AddReferences(MetadataReference.CreateFromFile(typeof(object).Assembly.Location))
            .AddSyntaxTrees(tree);

        var model = compilation.GetSemanticModel(tree);

        compilation = compilation.AddReferences(
            MetadataReference.CreateFromFile(typeof(IServiceCollection).Assembly.Location)
        );

        var root = tree.GetRoot();

        // Extract registrations semantically
        var methodInvocations = root.DescendantNodes().OfType<InvocationExpressionSyntax>();
        foreach (var invocation in methodInvocations)
        {
            var symbolInfo = model.GetSymbolInfo(invocation.Expression);
            var methodSymbol = symbolInfo.Symbol as IMethodSymbol;
            if (methodSymbol != null &&
                methodSymbol.Name.StartsWith("Add") &&
                (methodSymbol.Name.EndsWith("Singleton") || methodSymbol.Name.EndsWith("Scoped") || methodSymbol.Name.EndsWith("Transient")) &&
                methodSymbol.ContainingType.Name == "IServiceCollection" &&
                methodSymbol.ContainingType.ContainingNamespace.Name == "Microsoft.Extensions.DependencyInjection")
            {
                var lifetime = methodSymbol.Name.EndsWith("Singleton") ? "Singleton" : methodSymbol.Name.EndsWith("Scoped") ? "Scoped" : "Transient";
                string serviceType = methodSymbol.TypeArguments.Length > 0 ? methodSymbol.TypeArguments[0].ToDisplayString() : "";
                string implType = methodSymbol.TypeArguments.Length > 1 ? methodSymbol.TypeArguments[1].ToDisplayString() : serviceType;
                var lineNumber = invocation.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                result.Registrations.Add(new Registration
                {
                    Lifetime = lifetime,
                    ServiceType = serviceType,
                    ImplementationType = implType,
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    MethodCall = methodSymbol.Name
                });
            }
        }

        // Extract injection sites: constructor parameters and fields
        var constructors = root.DescendantNodes().OfType<ConstructorDeclarationSyntax>();
        foreach (var ctor in constructors)
        {
            var classDecl = ctor.Parent as ClassDeclarationSyntax;
            var className = classDecl?.Identifier.Text ?? "Unknown";
            foreach (var param in ctor.ParameterList.Parameters)
            {
                var serviceType = param.Type?.ToString() ?? "";
                var memberName = param.Identifier.Text;
                var lineNumber = param.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                result.InjectionSites.Add(new InjectionSite
                {
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    ClassName = className,
                    MemberName = memberName,
                    Type = "constructor",
                    ServiceType = serviceType
                });
            }
        }

        var fields = root.DescendantNodes().OfType<FieldDeclarationSyntax>();
        foreach (var field in fields)
        {
            var classDecl = field.Parent as ClassDeclarationSyntax;
            var className = classDecl?.Identifier.Text ?? "Unknown";
            foreach (var variable in field.Declaration.Variables)
            {
                var serviceType = field.Declaration.Type?.ToString() ?? "";
                var memberName = variable.Identifier.Text;
                var lineNumber = variable.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                result.InjectionSites.Add(new InjectionSite
                {
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    ClassName = className,
                    MemberName = memberName,
                    Type = "field",
                    ServiceType = serviceType
                });
            }
        }

        return result;
    }
}
