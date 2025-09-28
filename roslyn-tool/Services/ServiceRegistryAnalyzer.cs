namespace DIServiceAnalyzer.Services;

public class ServiceRegistryAnalyzer : IServiceRegistryAnalyzer
{
    public List<ServiceRegistration> AnalyzeServiceRegistrations(string sourceCode, string filePath)
    {
        var registrations = new List<ServiceRegistration>();
        var tree = CSharpSyntaxTree.ParseText(sourceCode);
        var root = tree.GetRoot();
        var serviceCollectionInvocations = FindServiceCollectionInvocations(root);
        foreach (var invocation in serviceCollectionInvocations)
        {
            var registration = AnalyzeInvocation(invocation, filePath);
            if (registration is not null)
            {
                registrations.Add(registration);
            }
        }
        return registrations;
    }
    private static ServiceRegistration? AnalyzeInvocation(InvocationExpressionSyntax invocation, string filePath)
    {
        var methodName = ExtractMethodNameFromInvocation(invocation);
        if (string.IsNullOrWhiteSpace(methodName)) return null;

        var lineNumber = invocation
                        .GetLocation()
                        .GetLineSpan().StartLinePosition.Line + 1;

        return AnalyzeGenericServiceRegistration(invocation, methodName, filePath, lineNumber);
    }
    private static ServiceRegistration? AnalyzeGenericServiceRegistration(
        InvocationExpressionSyntax invocation,
        string methodName,
        string filePath,
        int lineNumber
    )
    {
        var arguments = invocation.ArgumentList.Arguments;
        var lifetime = GetServiceLifetime(methodName, arguments);

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

            var hasLambdaExpression = arguments.Any(arg =>
                arg.Expression is LambdaExpressionSyntax ||
                HasNestedLambdaExpression(arg.Expression) ||
                arg.Expression.ToString().Contains("=>"));

            if (hasLambdaExpression || implementationType == "FactoryMethod")
            {
                // For lambda expressions, try to extract the actual service type from the first argument
                var firstArgType = ExtractTypeFromExpression(firstArg.Expression);
                var lambdaServiceType = !string.IsNullOrEmpty(firstArgType) ? firstArgType : methodName;

                return CreateServiceRegistration(
                    lambdaServiceType, methodName, lifetime, methodName, filePath, lineNumber);
            }

            // If serviceType is empty (e.g., from builder.Configuration), use method name for service identification
            var finalServiceType = !string.IsNullOrEmpty(serviceType) ? serviceType : methodName;

            return CreateServiceRegistration(
                finalServiceType, implementationType, lifetime, methodName, filePath, lineNumber);
        }

        // Handle single argument with type (e.g., services.AddTransient(typeof(IService)))
        if (arguments.Count == 1)
        {
            var firstArgument = arguments[0];
            if (firstArgument.Expression is LambdaExpressionSyntax ||
                HasNestedLambdaExpression(firstArgument.Expression) ||
                firstArgument.Expression.ToString().Contains("=>"))
            {
                // For single argument lambda expressions, the service type is typically the method name
                // but we can try to extract more specific information from the lambda
                var lambdaServiceType = ExtractServiceTypeFromLambda(firstArgument.Expression);
                var finalServiceType = !string.IsNullOrEmpty(lambdaServiceType) ? lambdaServiceType : methodName;

                return CreateServiceRegistration(
                    finalServiceType, methodName, lifetime, methodName, filePath, lineNumber);
            }

            if (!string.IsNullOrEmpty(serviceType))
            {
                return CreateServiceRegistration(
                    serviceType, serviceType, lifetime, methodName, filePath, lineNumber);
            }
            else
            {
                return CreateServiceRegistration(
                    methodName, methodName, lifetime, methodName, filePath, lineNumber);
            }
        }
        return null;
    }
    private static string ExtractMethodNameFromInvocation(InvocationExpressionSyntax invocation)
    {
        try
        {
            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                var methodName = memberAccess.Name.ToString();
                if (memberAccess.Name is GenericNameSyntax genericName)
                {
                    return genericName.Identifier.Text;
                }
                return methodName;
            }

            // Handle more complex expressions that might contain the method call
            if (invocation.Expression is InvocationExpressionSyntax nestedInvocation)
            {
                return ExtractMethodNameFromInvocation(nestedInvocation);
            }

            // Enhanced fallback: try to extract from the expression's string representation
            var expressionText = invocation.ToString();

            if (!string.IsNullOrEmpty(expressionText))
            {
                // For expressions with lambda arguments, we need to extract the method name
                // before the lambda starts. Lambda expressions typically start with '(' or identifier =>
                var lambdaStartPatterns = new[]
                {
                    @"\s*\w+\s*=>",  // Matches "param =>" patterns
                    @"\s*\(",        // Matches opening parenthesis for lambda parameters
                };

                // Find the method name by looking before any lambda expressions
                var methodName = ExtractMethodNameFromExpression(expressionText, lambdaStartPatterns);

                if (!string.IsNullOrEmpty(methodName))
                {
                    // Validate that this looks like a method name (starts with Add/TryAdd)
                    if (methodName.StartsWith("Add") || methodName.StartsWith("TryAdd"))
                    {
                        return methodName;
                    }
                }

                // Fallback: Extract the last part after the dot
                var lastDotIndex = expressionText.LastIndexOf('.');
                if (lastDotIndex >= 0 && lastDotIndex < expressionText.Length - 1)
                {
                    var fallbackName = expressionText[(lastDotIndex + 1)..];
                    // Clean up the fallback name by removing everything after '(' or ' ' (for lambda cases)
                    var cleanName = fallbackName.Split('(', ' ', '<')[0];
                    return cleanName;
                }

                return expressionText;
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string ExtractMethodNameFromExpression(string expressionText, string[] lambdaStartPatterns)
    {
        try
        {
            var methodCallPatterns = new[]
            {
                @"\.(\w+)\s*\(",  // Matches "services.AddMethodName("
                @"(\w+)\s*\(",     // Matches "AddMethodName(" at start
            };

            foreach (var pattern in methodCallPatterns)
            {
                var match = Regex.Match(expressionText, pattern);
                if (match.Success)
                {
                    var extracted = match.Groups[1].Value;
                    var remainingText = expressionText[(match.Index + match.Length)..];
                    bool hasLambdaAfter = lambdaStartPatterns.Any(pattern =>
                        Regex.Match(remainingText, pattern).Success);

                    if (hasLambdaAfter || extracted.StartsWith("Add"))
                    {
                        return extracted;
                    }
                }
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
        var allInvocations = root.DescendantNodes().OfType<InvocationExpressionSyntax>();
        foreach (var invocation in allInvocations)
        {
            var methodName = ExtractMethodNameFromInvocation(invocation);

            if (invocation.Expression is MemberAccessExpressionSyntax memberAccess)
            {
                if (IsDiMethod(methodName))
                {
                    if (IsServiceCollectionExpression(memberAccess.Expression))
                    {
                        invocations.Add(invocation);
                    }
                }
            }
            else
            {
                if (IsDiMethod(methodName))
                {
                    var expressionText = invocation.Expression.ToString();
                    if (expressionText == "services" || expressionText == "Services")
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
    private static ServiceScope GetServiceLifetime(string methodName, SeparatedSyntaxList<ArgumentSyntax> args)
    {
        // Direct mapping for known method names
        var baseMethodName = methodName.Split('<')[0].Trim();

        if (baseMethodName.StartsWith("AddSingleton") || baseMethodName == "TryAddSingleton")
            return ServiceScope.Singleton;
        if (baseMethodName.StartsWith("AddScoped") || baseMethodName == "TryAddScoped")
            return ServiceScope.Scoped;
        if (baseMethodName.StartsWith("AddTransient") || baseMethodName == "TryAddTransient")
            return ServiceScope.Transient;

        // Check for ServiceLifetime argument
        foreach (var arg in args)
        {
            var argText = arg.ToString();
            if (argText.Contains(ServiceLifetime.Singleton.ToString()))
                return ServiceScope.Singleton;
            else if (argText.Contains(ServiceLifetime.Scoped.ToString()))
                return ServiceScope.Scoped;
            else if (argText.Contains(ServiceLifetime.Transient.ToString()))
                return ServiceScope.Transient;
            else
                return ServiceScope.Others;
        }

        // Fallback
        return ServiceScope.Others;
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
                    return ExtractTypeFromLambdaExpression(lambda);

                case ObjectCreationExpressionSyntax objectCreation:
                    return objectCreation.Type.ToString();

                case ParenthesizedExpressionSyntax parenthesized:
                    return ExtractTypeFromExpression(parenthesized.Expression);

                case MemberAccessExpressionSyntax memberAccess:
                    return string.Empty;

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
            if (lambda.Body is ExpressionSyntax lambdaBody)
            {
                return ExtractTypeFromLambdaBody(lambdaBody);
            }

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
            if (lambdaBody is ObjectCreationExpressionSyntax objectCreation)
            {
                return objectCreation.Type.ToString();
            }

            // Handle method calls: serviceProvider.GetService<Service>()
            if (lambdaBody is InvocationExpressionSyntax invocation)
            {
                // First, try to extract service type from GetService/GetRequiredService calls in the entire expression tree
                var serviceType = FindServiceTypeInExpression(invocation);
                if (serviceType != null)
                {
                    return serviceType;
                }

                return ExtractTypeFromLambdaBody(invocation.Expression);
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

            // Handle member access expressions (e.g., sp.GetRequiredService<T>())
            if (lambdaBody is MemberAccessExpressionSyntax memberAccess)
            {
                return ExtractServiceTypeFromMemberAccess(memberAccess);
            }
            return "FactoryMethod";
        }
        catch
        {
            return "FactoryMethod";
        }
    }

    private static string? FindServiceTypeInExpression(ExpressionSyntax expression)
    {

        switch (expression)
        {
            case InvocationExpressionSyntax invocation:
                var serviceType = ExtractServiceTypeFromInvocation(invocation);
                if (serviceType != null)
                {
                    return serviceType;
                }
                return FindServiceTypeInExpression(invocation.Expression);
            case MemberAccessExpressionSyntax memberAccess:
                serviceType = ExtractServiceTypeFromMemberAccess(memberAccess);
                if (serviceType != null)
                {
                    return serviceType;
                }
                return FindServiceTypeInExpression(memberAccess.Expression);
            default:
                return null;
        }
    }

    private static string? ExtractServiceTypeFromInvocation(InvocationExpressionSyntax invocation)
    {
        // Check if this is a GetService or GetRequiredService call
        if (invocation.Expression is MemberAccessExpressionSyntax memberAccess &&
            (memberAccess.Name.ToString().Contains("GetService") ||
             memberAccess.Name.ToString().Contains("GetRequiredService")) &&
            memberAccess.Name is GenericNameSyntax genericName)
        {
            return genericName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
        }

        return null;
    }

    private static string? ExtractServiceTypeFromMemberAccess(MemberAccessExpressionSyntax memberAccess)
    {
        if ((memberAccess.Name.ToString().Contains("GetService") ||
             memberAccess.Name.ToString().Contains("GetRequiredService")) &&
            memberAccess.Name is GenericNameSyntax genericName)
        {
            return genericName.TypeArgumentList.Arguments.FirstOrDefault()?.ToString();
        }
        return null;
    }

    private static bool HasNestedLambdaExpression(ExpressionSyntax expression)
    {
        var lambdaExpressions = expression.DescendantNodes().OfType<LambdaExpressionSyntax>();
        return lambdaExpressions.Any();
    }

    private static string ExtractServiceTypeFromLambda(ExpressionSyntax lambdaExpression)
    {
        try
        {
            var lambdaText = lambdaExpression.ToString();
            if (lambdaText.Contains('=') && lambdaText.Contains("=>"))
            {
                return string.Empty;
            }

            // For more complex lambdas, try to extract type information
            if (lambdaExpression is LambdaExpressionSyntax lambda)
            {
                // Look for object creation or type references in the lambda body
                var objectCreations = lambda.Body.DescendantNodes().OfType<ObjectCreationExpressionSyntax>();
                if (objectCreations.Any())
                {
                    return objectCreations.First().Type.ToString();
                }

                // Look for type references
                var typeRefs = lambda.Body.DescendantNodes()
                    .OfType<TypeSyntax>()
                    .Where(t => !t.ToString().Contains("System") && !t.ToString().Contains("Microsoft"));
                if (typeRefs.Any())
                {
                    return typeRefs.First().ToString();
                }
            }

            return string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string ExtractNamespace(string filePath)
    {
        var directory = Path.GetDirectoryName(filePath);
        var parts = directory?.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return parts?.Last() ?? string.Empty;
    }
    private static bool IsDiMethod(string methodName)
    {
        var baseMethodName = methodName.Split('<')[0].Trim();
        return baseMethodName.StartsWith("Add") || baseMethodName.StartsWith("TryAdd");
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
        return registeredServices;
    }
    public List<CustomRegistry> DetectCustomRegistries(string sourceCode, string filePath)
    {
        var customRegistries = new List<CustomRegistry>();
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
        return customRegistries;
    }
    private static CustomRegistry? AnalyzeCustomRegistry(ClassDeclarationSyntax classDecl, string filePath)
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
        return null;
    }
    private static CustomRegistry? AnalyzeExtensionMethod(MethodDeclarationSyntax methodDecl, string filePath)
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
        return null;
    }
}