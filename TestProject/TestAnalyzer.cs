using System;
using System.IO;
using System.Linq;

public class TestAnalyzer
{
    public static void Main()
    {
        try
        {
            // Read the test file
            var testFilePath = "SimpleFactoryTest.cs";
            var sourceCode = File.ReadAllText(testFilePath);

            // Create the analyzer
            var analyzer = new ServiceRegistryAnalyzer();

            // Analyze the service registrations
            var registrations = analyzer.AnalyzeServiceRegistrations(sourceCode, testFilePath);

            // Display results
            Console.WriteLine("=== Service Registration Analysis Results ===");
            Console.WriteLine();

            foreach (var registration in registrations)
            {
                Console.WriteLine($"Service: {registration.ServiceType}");
                Console.WriteLine($"Implementation: {registration.ImplementationType}");
                Console.WriteLine($"Method: {registration.RegistrationMethod}");
                Console.WriteLine($"Lifetime: {registration.Lifetime}");
                Console.WriteLine($"File: {registration.FilePath}");
                Console.WriteLine($"Line: {registration.LineNumber}");
                Console.WriteLine("---");
            }

            // Check if our fix worked
            var factoryMethodRegistrations = registrations.Where(r =>
                r.RegistrationMethod == "AddCors" || r.RegistrationMethod == "AddOpenApi").ToList();

            Console.WriteLine($"Found {factoryMethodRegistrations.Count} factory method registrations:");

            foreach (var reg in factoryMethodRegistrations)
            {
                var isFixed = reg.ServiceType == reg.RegistrationMethod &&
                             reg.ImplementationType == reg.RegistrationMethod;

                Console.WriteLine($"  {reg.RegistrationMethod}: ServiceType='{reg.ServiceType}', ImplementationType='{reg.ImplementationType}' - Fixed: {isFixed}");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
        }
    }
}