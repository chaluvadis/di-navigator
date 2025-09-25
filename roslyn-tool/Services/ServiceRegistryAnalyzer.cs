namespace DIServiceAnalyzer.Services;

public class ServiceRegistryAnalyzer : IServiceRegistryAnalyzer
{
    public List<ServiceRegistration> AnalyzeServiceRegistrations(string sourceCode, string filePath)
    {
        var registrations = new List<ServiceRegistration>();
        try
        {
            var tree = CSharpSyntaxTree.ParseText(sourceCode);
            var root = tree.GetRoot();
            var invocations = root.DescendantNodes().OfType<InvocationExpressionSyntax>();
            foreach (var invocation in invocations)
            {
                var registration = AnalyzeInvocation(invocation, filePath);
                if (registration is not null)
                {
                    registrations.Add(registration);
                }
            }
        }
        catch
        {
            throw;
        }
        return registrations;
    }
    private static ServiceRegistration? AnalyzeInvocation(InvocationExpressionSyntax invocation, string filePath)
    {
        try
        {
            var expression = invocation.Expression.ToString();
            var methodName = GetMethodName(expression);
            if (string.IsNullOrWhiteSpace(methodName)) return null;
            var lineNumber = invocation
                            .GetLocation()
                            .GetLineSpan().StartLinePosition.Line + 1;

            return AnalyzeGenericServiceRegistration(invocation, methodName, filePath, lineNumber);
        }
        catch
        {
            throw;
        }
    }
    private static ServiceRegistration? AnalyzeGenericServiceRegistration(
        InvocationExpressionSyntax invocation,
        string methodName,
        string filePath,
        int lineNumber
    )
    {
        try
        {
            var arguments = invocation.ArgumentList.Arguments;
            var lifetime = GetServiceLifetime(methodName);

            // Handle generic type arguments (e.g., services.AddTransient<IService, Service>())
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var genericArgs = ExtractGenericArguments(memberAccess);
                if (genericArgs.Count >= 2)
                {
                    return CreateServiceRegistration(
                        genericArgs[0], genericArgs[1], lifetime, methodName, filePath, lineNumber);
                }
            }

            // Handle different argument patterns
            if (arguments.Count == 0)
            {
                return null;
            }

            var firstArg = arguments[0];
            var serviceType = ExtractTypeFromExpression(firstArg.Expression);

            // Handle factory method registrations (e.g., services.AddTransient<IService>(sp => new Service()))
            if (arguments.Count >= 2)
            {
                var secondArg = arguments[1];
                var implementationType = ExtractTypeFromExpression(secondArg.Expression);
                return CreateServiceRegistration(
                    serviceType, implementationType, lifetime, methodName, filePath, lineNumber);
            }

            // Handle single argument with type (e.g., services.AddTransient(typeof(IService)))
            if (arguments.Count == 1 && !string.IsNullOrEmpty(serviceType))
            {
                return CreateServiceRegistration(
                    serviceType, serviceType, lifetime, methodName, filePath, lineNumber);
            }

            return null;
        }
        catch
        {
            throw;
        }
    }
    private static string GetMethodName(string expression)
    {
        var isService = expression.StartsWith("services") || expression.StartsWith("builder.Services");
        return isService ? expression.Split('.').Last() : string.Empty;
    }
    private static ServiceScope GetServiceLifetime(string methodName)
    {
        var baseMethodName = methodName.Split('<')[0];
        return baseMethodName switch
        {
            "AddTransient" => ServiceScope.Transient,
            "AddScoped" => ServiceScope.Scoped,
            "AddSingleton" => ServiceScope.Singleton,
            "AddControllers" => ServiceScope.Controllers,
            "AddMvc" => ServiceScope.Controllers,
            "AddRazorPages" => ServiceScope.Controllers,
            _ => ServiceScope.Others
        };
    }
    private static List<string> ExtractGenericArguments(MemberAccessExpressionSyntax memberAccess)
    {
        var genericArgs = new List<string>();
        try
        {
            if (memberAccess.Name is GenericNameSyntax genericName)
            {
                foreach (var typeArg in genericName.TypeArgumentList.Arguments)
                {
                    genericArgs.Add(typeArg.ToString());
                }
            }
        }
        catch
        {
            throw;
        }
        return genericArgs;
    }
    private static string ExtractTypeFromExpression(ExpressionSyntax expression)
    {
        try
        {
            switch (expression)
            {
                case TypeOfExpressionSyntax typeOfExpr:
                    return typeOfExpr.Type.ToString();

                case GenericNameSyntax genericName:
                    return genericName.ToString();

                case QualifiedNameSyntax qualifiedName:
                    return qualifiedName.ToString();

                case SimpleNameSyntax simpleName:
                    return simpleName.ToString();

                case InvocationExpressionSyntax invocation:
                    if (invocation.Expression.ToString() == "typeof")
                    {
                        var typeArg = invocation.ArgumentList.Arguments.FirstOrDefault();
                        if (typeArg != null)
                        {
                            return ExtractTypeFromExpression(typeArg.Expression);
                        }
                        return string.Empty;
                    }
                    return invocation.ToString();

                case LambdaExpressionSyntax lambda:
                    // Handle lambda expressions like sp => new Service()
                    // Try to extract the return type from the lambda body
                    if (lambda.Body is ExpressionSyntax lambdaBody)
                    {
                        return ExtractTypeFromExpression(lambdaBody);
                    }
                    return "FactoryMethod";

                case ObjectCreationExpressionSyntax objectCreation:
                    return objectCreation.Type.ToString();

                case ParenthesizedExpressionSyntax parenthesized:
                    return ExtractTypeFromExpression(parenthesized.Expression);

                case MemberAccessExpressionSyntax memberAccess:
                    return memberAccess.ToString();
                default:
                    return expression.ToString();
            }
        }
        catch
        {
            throw;
        }
    }
    private static string ExtractNamespace(string filePath)
    {
        try
        {
            var directory = Path.GetDirectoryName(filePath);
            var parts = directory?.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            return parts?.Last() ?? string.Empty;
        }
        catch
        {
            return "Unknown";
        }
    }
    private static bool IsDiMethod(string methodName) =>
        methodName is "AddTransient" or "AddScoped" or "AddSingleton"
                   or "AddControllers" or "AddMvc" or "AddRazorPages";
    private static ServiceRegistration CreateServiceRegistration(
        string serviceType,
        string implementationType,
        ServiceScope lifetime,
        string methodName,
        string filePath,
        int lineNumber
    ) => new()
    {
        ServiceType = serviceType,
        ImplementationType = implementationType,
        Lifetime = lifetime,
        RegistrationMethod = methodName,
        FilePath = filePath,
        LineNumber = lineNumber,
        Namespace = ExtractNamespace(filePath)
    };

    private static List<string> ExtractServicesFromMethod(MethodDeclarationSyntax methodDecl, string filePath)
    {
        var registeredServices = new List<string>();
        try
        {
            var invocations = methodDecl.DescendantNodes().OfType<InvocationExpressionSyntax>();
            foreach (var invocation in invocations)
            {
                var expression = invocation.Expression.ToString();
                var methodName = GetMethodName(expression);
                if (!string.IsNullOrWhiteSpace(methodName) && IsDiMethod(methodName))
                {
                    var lineNumber = invocation.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                    var serviceInfo = $"{methodName} (line {lineNumber})";
                    registeredServices.Add(serviceInfo);
                }
            }
        }
        catch
        {
            throw;
        }
        return registeredServices;
    }
    public List<CustomRegistry> DetectCustomRegistries(string sourceCode, string filePath)
    {
        var customRegistries = new List<CustomRegistry>();
        try
        {
            var tree = CSharpSyntaxTree.ParseText(sourceCode);
            var root = tree.GetRoot();
            // Look for classes that might be service registries
            var classDeclarations = root.DescendantNodes().OfType<ClassDeclarationSyntax>();
            foreach (var classDecl in classDeclarations)
            {
                var customRegistry = AnalyzeCustomRegistry(classDecl, filePath);
                if (customRegistry is not null)
                {
                    customRegistries.Add(customRegistry);
                }
            }
            // Look for extension methods that register services
            var methodDeclarations = root.DescendantNodes().OfType<MethodDeclarationSyntax>();
            foreach (var methodDecl in methodDeclarations)
            {
                var customRegistry = AnalyzeExtensionMethod(methodDecl, filePath);
                if (customRegistry is not null)
                {
                    customRegistries.Add(customRegistry);
                }
            }
        }
        catch
        {
            throw;
        }
        return customRegistries;
    }
    private static CustomRegistry? AnalyzeCustomRegistry(ClassDeclarationSyntax classDecl, string filePath)
    {
        try
        {
            var className = classDecl.Identifier.Text;
            var lineNumber = classDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            var registeredServices = new List<string>();

            // Check if class contains DI registration methods
            var methods = classDecl.DescendantNodes().OfType<MethodDeclarationSyntax>();
            var hasDiMethods = methods.Any(m => IsDiMethod(GetMethodName(m.Identifier.Text)));

            if (hasDiMethods)
            {
                // Extract actual service registrations from all methods in the class
                foreach (var method in methods)
                {
                    var servicesInMethod = ExtractServicesFromMethod(method, filePath);
                    registeredServices.AddRange(servicesInMethod);
                }
                return new CustomRegistry
                {
                    RegistryName = className,
                    RegistryType = "ServiceRegistry",
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    RegisteredServices = registeredServices
                };
            }
        }
        catch
        {
            throw;
        }
        return null;
    }
    private static CustomRegistry? AnalyzeExtensionMethod(MethodDeclarationSyntax methodDecl, string filePath)
    {
        try
        {
            var methodName = methodDecl.Identifier.Text;
            var lineNumber = methodDecl.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            var registeredServices = new List<string>();

            // Check if it's an extension method for IServiceCollection
            var hasDiMethods = methodDecl.DescendantNodes()
                .OfType<InvocationExpressionSyntax>()
                .Any(inv => IsDiMethod(GetMethodName(inv.Expression.ToString())));

            if (hasDiMethods && methodName.StartsWith("Add"))
            {
                registeredServices = ExtractServicesFromMethod(methodDecl, filePath);
                return new CustomRegistry
                {
                    RegistryName = methodName,
                    RegistryType = "ExtensionMethod",
                    FilePath = filePath,
                    LineNumber = lineNumber,
                    RegisteredServices = registeredServices
                };
            }
        }
        catch
        {
            throw;
        }
        return null;
    }
}