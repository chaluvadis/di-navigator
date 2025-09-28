// This file tests lambda expression parsing in DI registrations
// These are not meant to compile, just to test the parser

public class LambdaParsingTest
{
    public void TestMethod()
    {
        // These method calls should be parsed correctly despite lambda expressions

        // Test case 1: services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
        // Expected: Method name should be "AddQuartzHostedService", not "q.WaitForJobsToComplete"

        // Test case 2: services.AddQuartz(q => { q.UseSimpleTypeLoader(); q.UseInMemoryStore(); });
        // Expected: Method name should be "AddQuartz", not "FactoryMethod"

        // Test case 3: services.AddSomeService(x => x.Property = value);
        // Expected: Method name should be "AddSomeService"

        // Test case 4: services.ConfigureQuartz(q => q.WaitForJobsToComplete = true);
        // Expected: Method name should be "ConfigureQuartz"
    }
}