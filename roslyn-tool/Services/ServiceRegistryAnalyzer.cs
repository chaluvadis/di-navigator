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

            // Only analyze method calls on IServiceCollection variables
            var serviceCollectionInvocations = FindServiceCollectionInvocations(root);
            foreach (var invocation in serviceCollectionInvocations)
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
            // Extract method name directly from syntax tree
            var methodName = ExtractMethodNameFromInvocation(invocation);
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
    private static string ExtractMethodNameFromInvocation(InvocationExpressionSyntax invocation)
    {
        try
        {
            // Extract method name directly from the syntax tree
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var methodName = memberAccess.Name.ToString();

                // Handle generic methods like AddTransient<T>()
                if (memberAccess.Name is GenericNameSyntax genericName)
                {
                    return genericName.Identifier.Text;
                }

                return methodName;
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static List<InvocationExpressionSyntax> FindServiceCollectionInvocations(SyntaxNode root)
    {
        var invocations = new List<InvocationExpressionSyntax>();

        // Find all invocations that are DI registration methods
        var allInvocations = root.DescendantNodes().OfType<InvocationExpressionSyntax>();
        foreach (var invocation in allInvocations)
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var methodName = ExtractMethodNameFromInvocation(invocation);

                // Check if this is a DI method call
                if (IsDiMethod(methodName))
                {
                    // Check if this is called on an IServiceCollection
                    if (IsServiceCollectionExpression(memberAccess.Expression))
                    {
                        invocations.Add(invocation);
                    }
                }
            }
        }

        return invocations;
    }

    private static bool IsServiceCollectionExpression(ExpressionSyntax expression)
    {
        try
        {
            switch (expression)
            {
                case IdentifierNameSyntax identifier:
                    // Direct variable reference: "services"
                    var identifierName = identifier.Identifier.Text;
                    return identifierName == "services" || identifierName == "Services";

                case MemberAccessExpressionSyntax memberAccess:
                    // Handle cases like "builder.Services", "container.Services", etc.
                    var memberName = memberAccess.Name.ToString();
                    return memberName == "Services" || memberName == "services";

                case GenericNameSyntax genericName:
                    // Handle generic types that might be IServiceCollection
                    return genericName.Identifier.Text.Contains("Service") ||
                           genericName.ToString().Contains("IServiceCollection");

                default:
                    // Check if the expression contains service-related keywords
                    var expressionText = expression.ToString();
                    return expressionText.Contains("services") ||
                           expressionText.Contains("Services") ||
                           expressionText.Contains("IServiceCollection") ||
                           expressionText.Contains("ServiceCollection");
            }
        }
        catch
        {
            return false;
        }
    }
    private static ServiceScope GetServiceLifetime(string methodName)
    {
        // Remove generic type parameters for comparison
        var baseMethodName = methodName.Split('<')[0].Trim();

        return baseMethodName switch
        {
            "AddTransient" => ServiceScope.Transient,
            "AddScoped" => ServiceScope.Scoped,
            "AddSingleton" => ServiceScope.Singleton,
            "TryAddTransient" => ServiceScope.Transient,
            "TryAddScoped" => ServiceScope.Scoped,
            "TryAddSingleton" => ServiceScope.Singleton,
            "AddControllers" => ServiceScope.Controllers,
            "AddMvc" => ServiceScope.Controllers,
            "AddRazorPages" => ServiceScope.Controllers,
            "AddControllersWithViews" => ServiceScope.Controllers,
            "AddRazorRuntimeCompilation" => ServiceScope.Controllers,
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
                    return ExtractTypeFromLambdaExpression(lambda);

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
        catch (Exception ex)
        {
            Console.WriteLine($"Error extracting type from expression: {ex.Message}");
            return expression.ToString();
        }
    }
    private static string ExtractTypeFromLambdaExpression(LambdaExpressionSyntax lambda)
    {
        try
        {
            // Handle lambda expressions like sp => new Service() or sp => { return new Service(); }
            if (lambda.Body is ExpressionSyntax lambdaBody)
            {
                return ExtractTypeFromLambdaBody(lambdaBody);
            }

            // Handle lambda expressions with statement body like sp => { return new Service(); }
            if (lambda.Body is BlockSyntax blockBody)
            {
                var returnStatement = blockBody.Statements
                    .OfType<ReturnStatementSyntax>()
                    .FirstOrDefault();

                if (returnStatement?.Expression != null)
                {
                    return ExtractTypeFromLambdaBody(returnStatement.Expression);
                }
            }

            return "FactoryMethod";
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error extracting type from lambda expression: {ex.Message}");
            return "FactoryMethod";
        }
    }

    private static string ExtractTypeFromLambdaBody(ExpressionSyntax lambdaBody)
    {
        try
        {
            // Handle object creation: new Service()
            if (lambdaBody is ObjectCreationExpressionSyntax objectCreation)
            {
                return objectCreation.Type.ToString();
            }

            // Handle method calls: serviceProvider.GetService<Service>()
            if (lambdaBody is InvocationExpressionSyntax invocation)
            {
                var expressionText = invocation.Expression.ToString();
                if (expressionText.Contains("GetService") || expressionText.Contains("GetRequiredService"))
                {
                    // Try to extract generic type argument
                    if (invocation.Expression is MemberAccessExpressionSyntax memberAccess &&
                        memberAccess.Name is GenericNameSyntax genericName)
                    {
                        return genericName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString() ?? "FactoryMethod";
                    }
                }

                return invocation.ToString();
            }

            // Handle cast expressions: (Service)sp.GetService(typeof(IService))
            if (lambdaBody is CastExpressionSyntax castExpression)
            {
                return castExpression.Type.ToString();
            }

            // Handle parenthesized expressions
            if (lambdaBody is ParenthesizedExpressionSyntax parenthesized)
            {
                return ExtractTypeFromLambdaBody(parenthesized.Expression);
            }

            // Fallback to the expression's string representation
            return lambdaBody.ToString();
        }
        catch
        {
            return "FactoryMethod";
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
    private static bool IsDiMethod(string methodName)
    {
        // Extract the base method name before generic parameters
        var baseMethodName = methodName.Split('<')[0];
        return baseMethodName is "AddTransient" or "AddScoped" or "AddSingleton"
                              or "AddControllers" or "AddMvc" or "AddRazorPages";
    }
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

    private static List<string> ExtractServicesFromMethod(MethodDeclarationSyntax methodDecl)
    {
        var registeredServices = new List<string>();
        try
        {
            var invocations = methodDecl.DescendantNodes().OfType<InvocationExpressionSyntax>();
            foreach (var invocation in invocations)
            {
                var methodName = ExtractMethodNameFromInvocation(invocation);
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

            // Only look for classes that actually contain DI registration methods
            var classDeclarations = root.DescendantNodes().OfType<ClassDeclarationSyntax>();
            foreach (var classDecl in classDeclarations)
            {
                // Check if class contains DI methods before analyzing
                var hasDiMethods = classDecl.DescendantNodes()
                    .OfType<InvocationExpressionSyntax>()
                    .Any(inv => IsDiMethod(ExtractMethodNameFromInvocation(inv)));

                if (hasDiMethods)
                {
                    var customRegistry = AnalyzeCustomRegistry(classDecl, filePath);
                    if (customRegistry is not null)
                    {
                        customRegistries.Add(customRegistry);
                    }
                }
            }

            // Look for extension methods that register services
            var methodDeclarations = root.DescendantNodes().OfType<MethodDeclarationSyntax>();
            foreach (var methodDecl in methodDeclarations)
            {
                // Check if method contains DI registrations before analyzing
                var hasDiMethods = methodDecl.DescendantNodes()
                    .OfType<InvocationExpressionSyntax>()
                    .Any(inv => IsDiMethod(ExtractMethodNameFromInvocation(inv)));

                if (hasDiMethods)
                {
                    var customRegistry = AnalyzeExtensionMethod(methodDecl, filePath);
                    if (customRegistry is not null)
                    {
                        customRegistries.Add(customRegistry);
                    }
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
            var hasDiMethods = methods.Any(m => IsDiMethod(m.Identifier.Text));

            if (hasDiMethods)
            {
                // Extract actual service registrations from all methods in the class
                foreach (var method in methods)
                {
                    var servicesInMethod = ExtractServicesFromMethod(method);
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
                .Any(inv => IsDiMethod(ExtractMethodNameFromInvocation(inv)));

            if (hasDiMethods && methodName.StartsWith("Add"))
            {
                registeredServices = ExtractServicesFromMethod(methodDecl);
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