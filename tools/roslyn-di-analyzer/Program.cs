using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.CommandLine;
using System.Text.Json;
using System.Threading.Tasks;

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

    static async Task<AnalysisResult> AnalyzeFile(string filePath)
    {
        var result = new AnalysisResult();
        var code = await File.ReadAllTextAsync(filePath);
        var tree = CSharpSyntaxTree.ParseText(code);
        var compilation = CSharpCompilation.Create("Analysis")
            .AddReferences(MetadataReference.CreateFromFile(typeof(object).Assembly.Location))
            .AddSyntaxTrees(tree);

        var model = compilation.GetSemanticModel(tree);

        var root = tree.GetRoot();

        // Extract registrations: services.AddScoped<...>(...)
        var methodInvocations = root.DescendantNodes().OfType<InvocationExpressionSyntax>();
        foreach (var invocation in methodInvocations)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess &&
                memberAccess.Expression.ToString() == "services")
            {
                var methodName = memberAccess.Name.Identifier.Text;
                if (methodName.StartsWith("Add") && (methodName.EndsWith("Singleton") || methodName.EndsWith("Scoped") || methodName.EndsWith("Transient")))
                {
                    var lifetime = methodName.EndsWith("Singleton") ? "Singleton" : methodName.EndsWith("Scoped") ? "Scoped" : "Transient";
                    string serviceType = "";
                    string implType = "";
                    if (memberAccess.Name is GenericNameSyntax genericName && genericName.TypeArgumentList != null)
                    {
                        var typeArgs = genericName.TypeArgumentList.Arguments;
                        if (typeArgs.Count > 0)
                        {
                            serviceType = typeArgs[0].ToString();
                            if (typeArgs.Count > 1)
                            {
                                implType = typeArgs[1].ToString();
                            }
                            else
                            {
                                implType = serviceType;
                            }
                        }
                    }
                    else
                    {
                        // Non-generic, e.g., AddScoped<UserService>()
                        serviceType = memberAccess.Name.ToString();
                        implType = serviceType;
                    }
                    var lineNumber = invocation.GetLocation().GetLineSpan().StartLinePosition.Line + 1;

                    result.Registrations.Add(new Registration
                    {
                        Lifetime = lifetime,
                        ServiceType = serviceType,
                        ImplementationType = implType,
                        FilePath = filePath,
                        LineNumber = lineNumber,
                        MethodCall = methodName
                    });
                }
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
