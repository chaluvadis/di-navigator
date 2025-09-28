namespace DIServiceAnalyzer.Services;

public class ConstructorAnalyzer : IConstructorAnalyzer
{
    public List<ConstructorAnalysis> AnalyzeConstructorInjections(string sourceCode, string filePath)
    {
        var analyses = new List<ConstructorAnalysis>();

        try
        {
            var tree = CSharpSyntaxTree.ParseText(sourceCode);
            var root = tree.GetRoot();

            // Find all class declarations
            var classDeclarations = root.DescendantNodes().OfType<ClassDeclarationSyntax>();

            foreach (var classDecl in classDeclarations)
            {
                var analysis = AnalyzeClassConstructors(sourceCode, classDecl.Identifier.Text, filePath);
                if (analysis.Parameters.Any())
                {
                    analyses.Add(analysis);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Failed to analyze constructors in {filePath}: {ex.Message}");
        }

        return analyses;
    }

    public ConstructorAnalysis AnalyzeClassConstructors(string sourceCode, string className, string filePath)
    {
        var analysis = new ConstructorAnalysis
        {
            ClassName = className,
            FilePath = filePath,
            Parameters = new List<ConstructorParameter>()
        };

        try
        {
            var tree = CSharpSyntaxTree.ParseText(sourceCode);
            var root = tree.GetRoot();

            // Find the specific class
            var classDeclaration = root.DescendantNodes()
                .OfType<ClassDeclarationSyntax>()
                .FirstOrDefault(c => c.Identifier.Text == className);

            if (classDeclaration == null)
            {
                return analysis;
            }

            // Find all constructors in the class
            var constructors = classDeclaration.DescendantNodes()
                .OfType<ConstructorDeclarationSyntax>();

            foreach (var constructor in constructors)
            {
                var parameters = constructor.ParameterList.Parameters;
                foreach (var parameter in parameters)
                {
                    var paramAnalysis = new ConstructorParameter
                    {
                        TypeName = parameter.Type?.ToString() ?? string.Empty,
                        ParameterName = parameter.Identifier.Text,
                        IsDependencyInjection = IsDependencyInjectionParameter(parameter),
                        LineNumber = parameter.GetLocation().GetLineSpan().StartLinePosition.Line + 1
                    };

                    analysis.Parameters.Add(paramAnalysis);
                }
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Warning: Failed to analyze class {className} in {filePath}: {ex.Message}");
        }

        return analysis;
    }

    private static bool IsDependencyInjectionParameter(ParameterSyntax parameter)
    {
        // Simple heuristic: parameters that look like interfaces or have common DI suffixes
        var typeName = parameter.Type?.ToString() ?? string.Empty;

        // Check for interface pattern (starts with I)
        if (typeName.StartsWith("I") && typeName.Length > 1 && char.IsUpper(typeName[1]))
        {
            return true;
        }

        // Check for common service suffixes
        var serviceSuffixes = new[] { "Service", "Repository", "Manager", "Provider", "Client", "Handler" };
        if (serviceSuffixes.Any(suffix => typeName.EndsWith(suffix)))
        {
            return true;
        }

        // Check for collection patterns
        if (typeName.StartsWith("IEnumerable<") || typeName.StartsWith("IList<") || typeName.StartsWith("ICollection<"))
        {
            return true;
        }

        return false;
    }
}