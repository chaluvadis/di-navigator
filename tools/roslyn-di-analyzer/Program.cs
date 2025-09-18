using System.Diagnostics.CodeAnalysis;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.Json.Serialization.Metadata;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.MSBuild;

namespace RoslynDIAnalyzer;

public partial class Program
{
    public partial record Registration
    {
        public string Id { get; set; } = string.Empty;
        public string Lifetime { get; set; } = string.Empty;
        public string ServiceType { get; set; } = string.Empty;
        public string ImplementationType { get; set; } = string.Empty;
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; } = 0;
        public string MethodCall { get; set; } = string.Empty;
    }

    public partial record InjectionSite
    {
        public string FilePath { get; set; } = string.Empty;
        public int LineNumber { get; set; } = 0;
        public string ClassName { get; set; } = string.Empty;
        public string MemberName { get; set; } = string.Empty;
        public string Type { get; set; } = string.Empty;
        public string ServiceType { get; set; } = string.Empty;
        public string[] LinkedRegistrationIds { get; set; } = [];
    }

    public partial record AnalysisResult
    {
        public Registration[] Registrations { get; set; } = [];
        public InjectionSite[] InjectionSites { get; set; } = [];
        public string[] Cycles { get; set; } = [];
        public Dictionary<string, string[]> DependencyGraph { get; set; } = [];
    }

    [RequiresUnreferencedCode("")]
    public static async Task<int> Main(string[] args)
    {
        if (args.Length < 2 || args[0] != "--project")
        {
            Console.WriteLine("Usage: roslyn-di-analyzer --project <projectPath or solutionPath>");
            return 1;
        }

        string solutionOrProjectPath = args[1];
        if (!File.Exists(solutionOrProjectPath))
        {
            Console.WriteLine($"File not found: {solutionOrProjectPath}");
            return 1;
        }

        using var workspace = MSBuildWorkspace.Create();
        var result = new AnalysisResult();
        var dependencyGraph = new Dictionary<string, string[]>();
        var allServices = new HashSet<string>();

        bool isSolution = Path.GetExtension(solutionOrProjectPath).Equals(".sln", StringComparison.OrdinalIgnoreCase);

        IEnumerable<Project> projects;
        if (isSolution)
        {
            var solution = await workspace.OpenSolutionAsync(solutionOrProjectPath);
            projects = solution.Projects;
        }
        else
        {
            var project = await workspace.OpenProjectAsync(solutionOrProjectPath);
            projects = [project];
        }

        foreach (var project in projects)
        {
            foreach (var document in project.Documents)
            {
                var syntaxTree = await document.GetSyntaxTreeAsync();
                if (syntaxTree == null) continue;

                var root = syntaxTree.GetRoot();
                var semanticModel = await document.GetSemanticModelAsync();
                if (semanticModel == null) continue;

                // Extract registrations (e.g., builder.Services.AddScoped<IInterface>(Impl))
                var registrations = root.DescendantNodes().OfType<InvocationExpressionSyntax>()
                    .Where(inv => IsDIRegistrationInvocation(inv, semanticModel))
                    .Select(inv => ExtractRegistration(inv, syntaxTree, semanticModel))
                    .ToArray();

                result.Registrations = [.. result.Registrations, .. registrations];

                // Extract injection sites (constructors and fields)
                var ctorInjections = ExtractConstructorInjections(root, syntaxTree);
                var fieldInjections = ExtractFieldInjections(root, syntaxTree);

                result.InjectionSites = [.. result.InjectionSites, .. ctorInjections, .. fieldInjections];

                // Build graph from injections
                BuildDependencyGraph(root, dependencyGraph, allServices);
            }
        }

        result.DependencyGraph = dependencyGraph.ToDictionary(kv => kv.Key, kv => kv.Value ?? []);

        // Detect cycles
        var cycles = DetectCycles(dependencyGraph);
        result.Cycles = [.. cycles];

        var json = JsonSerializer.Serialize(
            result,
            JsonTypeInfo.CreateJsonTypeInfo<AnalysisResult>(new JsonSerializerOptions { WriteIndented = true })
        );
        Console.WriteLine(json);

        return 0;
    }

    private static bool IsDIRegistrationInvocation(InvocationExpressionSyntax invocation, SemanticModel semanticModel)
    {
        var symbol = semanticModel.GetSymbolInfo(invocation).Symbol;
        if (symbol == null) return false;

        var methodName = symbol.Name;
        if (!methodName.StartsWith("Add")) return false;

        // Check if called on IServiceCollection or similar
        if (invocation.Expression is not MemberAccessExpressionSyntax receiver) return false;

        var receiverType = semanticModel.GetTypeInfo(receiver.Expression).Type;
        return receiverType != null && receiverType.Name.Contains("ServiceCollection");
    }

    private static Registration ExtractRegistration(InvocationExpressionSyntax invocation, SyntaxTree syntaxTree, SemanticModel semanticModel)
    {
        var symbol = semanticModel.GetSymbolInfo(invocation).Symbol as IMethodSymbol;

        var methodName = symbol?.Name;
        var lifetime = methodName?.Replace("Add", "");

        var serviceType = "Unknown";
        var implType = "Unknown";

        // Extract generic args
        if (symbol?.TypeArguments.Length > 0)
        {
            serviceType = symbol.TypeArguments[0].ToDisplayString();
            if (symbol.TypeArguments.Length > 1)
            {
                implType = symbol.TypeArguments[1].ToDisplayString();
            }
        }

        // Or from arguments if lambda/factory
        var args = invocation.ArgumentList.Arguments;
        if (args.Count > 0 && args[0].Expression.IsKind(SyntaxKind.SimpleLambdaExpression))
        {
            implType = "Factory";
        }

        var location = invocation.GetLocation();
        var filePath = syntaxTree.FilePath;
        var lineNumber = location.GetLineSpan().StartLinePosition.Line + 1;

        var methodCall = invocation.ToString();

        return new Registration
        {
            Id = $"{filePath}:{lineNumber}",
            Lifetime = lifetime ?? string.Empty,
            ServiceType = serviceType,
            ImplementationType = implType,
            FilePath = filePath,
            LineNumber = lineNumber,
            MethodCall = methodCall
        };
    }

    private static InjectionSite[] ExtractConstructorInjections(SyntaxNode root, SyntaxTree syntaxTree)
    {
        var sites = new List<InjectionSite>();
        var constructors = root.DescendantNodes().OfType<ConstructorDeclarationSyntax>();
        foreach (var ctor in constructors)
        {
            var classDecl = ctor.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classDecl == null) continue;

            var className = classDecl.Identifier.ValueText;

            if (ctor.ParameterList != null)
            {
                foreach (var param in ctor.ParameterList.Parameters)
                {
                    var serviceType = param?.Type?.ToString();
                    var location = param?.GetLocation();
                    var lineNumber = location?.GetLineSpan().StartLinePosition.Line + 1;
                    var filePath = syntaxTree.FilePath;

                    sites.Add(new InjectionSite
                    {
                        FilePath = filePath,
                        LineNumber = lineNumber ?? 0,
                        ClassName = className,
                        MemberName = ctor.Identifier.ValueText,
                        Type = "constructor",
                        ServiceType = serviceType ?? string.Empty
                    });
                }
            }
        }
        return [.. sites];
    }

    private static InjectionSite[] ExtractFieldInjections(SyntaxNode root, SyntaxTree syntaxTree)
    {
        var sites = new List<InjectionSite>();
        var fields = root.DescendantNodes().OfType<FieldDeclarationSyntax>()
            .Where(f => f.Modifiers.Any(m => m.ValueText == "private" || m.ValueText == "readonly"));
        foreach (var field in fields)
        {
            var classDecl = field.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classDecl == null) continue;

            var className = classDecl.Identifier.ValueText;

            foreach (var varDecl in field.Declaration.Variables)
            {
                var serviceType = field.Declaration.Type.ToString();
                var location = varDecl.GetLocation();
                var lineNumber = location.GetLineSpan().StartLinePosition.Line + 1;
                var filePath = syntaxTree.FilePath;

                sites.Add(new InjectionSite
                {
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    ClassName = className,
                    MemberName = "field",
                    Type = "field",
                    ServiceType = serviceType
                });
            }
        }
        return [.. sites];
    }

    private static void BuildDependencyGraph(SyntaxNode root, Dictionary<string, string[]> dependencyGraph, HashSet<string> allServices)
    {
        // From constructor injections
        var constructors = root.DescendantNodes().OfType<ConstructorDeclarationSyntax>();
        foreach (var ctor in constructors)
        {
            var classDecl = ctor.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classDecl == null) continue;

            var className = classDecl.Identifier.ValueText;
            var deps = ctor.ParameterList?.Parameters.Select(p => p.Type?.ToString() ?? string.Empty).ToArray() ?? Array.Empty<string>();

            dependencyGraph[className] = deps;
            foreach (var dep in deps) allServices.Add(dep);
        }

        // From field injections
        var fields = root.DescendantNodes().OfType<FieldDeclarationSyntax>();
        foreach (var field in fields)
        {
            var classDecl = field.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classDecl == null) continue;

            var className = classDecl.Identifier.ValueText;
            var serviceType = field.Declaration.Type.ToString();

            if (!dependencyGraph.ContainsKey(className))
                dependencyGraph[className] = [];

            var currentDeps = dependencyGraph[className].ToList();
            if (!currentDeps.Contains(serviceType))
                currentDeps.Add(serviceType);
            dependencyGraph[className] = [.. currentDeps];

            allServices.Add(serviceType);
        }
    }

    private static List<string> DetectCycles(Dictionary<string, string[]> graph)
    {
        var cycles = new List<string>();
        var visited = new HashSet<string>();
        var recStack = new HashSet<string>();

        foreach (var node in graph.Keys)
        {
            if (HasCycle(node, graph, visited, recStack))
            {
                cycles.Add($"Cycle involving {node}");
            }
        }
        return cycles;
    }

    private static bool HasCycle(string node, Dictionary<string, string[]> graph, HashSet<string> visited, HashSet<string> recStack)
    {
        if (recStack.Contains(node)) return true;
        if (visited.Contains(node)) return false;

        visited.Add(node);
        recStack.Add(node);

        if (graph.TryGetValue(node, out string[]? value))
        {
            foreach (var neighbor in value)
            {
                if (HasCycle(neighbor, graph, visited, recStack))
                    return true;
            }
        }

        recStack.Remove(node);
        return false;
    }
}