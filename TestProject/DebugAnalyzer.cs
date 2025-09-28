using System;
using System.IO;

public class DebugAnalyzer
{
    public static void Main()
    {
        try
        {
            // Read the test file
            var testFilePath = "DebugFactoryTest.cs";
            var sourceCode = File.ReadAllText(testFilePath);

            Console.WriteLine($"Analyzing file: {testFilePath}");
            Console.WriteLine($"Source code length: {sourceCode.Length} characters");
            Console.WriteLine("Source code:");
            Console.WriteLine(sourceCode);
            Console.WriteLine("---");

            // Create the analyzer
            var analyzer = new ServiceRegistryAnalyzer();

            // Analyze the service registrations
            var registrations = analyzer.AnalyzeServiceRegistrations(sourceCode, testFilePath);

            // Display results
            Console.WriteLine($"Found {registrations.Count} registrations:");

            foreach (var registration in registrations)
            {
                Console.WriteLine($"ServiceType: '{registration.ServiceType}'");
                Console.WriteLine($"ImplementationType: '{registration.ImplementationType}'");
                Console.WriteLine($"RegistrationMethod: '{registration.RegistrationMethod}'");
                Console.WriteLine($"Lifetime: {registration.Lifetime}");
                Console.WriteLine("---");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Error: {ex.Message}");
            Console.WriteLine($"Stack trace: {ex.StackTrace}");
        }
    }
}