// This file demonstrates the lambda parsing issue and solution
// The analyzer should correctly extract method names even with lambda expressions

public class LambdaParsingDemo
{
    public void TestLambdaParsing()
    {
        // Before the fix, these would be parsed incorrectly:

        // 1. services.AddQuartzHostedService(q => q.WaitForJobsToComplete = true);
        //    OLD: Method name extracted as "q.WaitForJobsToComplete" (from lambda body)
        //    NEW: Method name extracted as "AddQuartzHostedService" (correct)

        // 2. services.AddQuartz(q => { q.UseSimpleTypeLoader(); q.UseInMemoryStore(); });
        //    OLD: Method name extracted as "FactoryMethod" (incorrect fallback)
        //    NEW: Method name extracted as "AddQuartz" (correct)

        // 3. services.ConfigureQuartz(q => q.WaitForJobsToComplete = true);
        //    OLD: Method name extracted as "q.WaitForJobsToComplete" (from lambda)
        //    NEW: Method name extracted as "ConfigureQuartz" (correct)

        // The fix improves the ExtractMethodNameFromInvocation method to:
        // - Better handle lambda expressions by looking for method names before lambda content
        // - Use more sophisticated string parsing that identifies method patterns
        // - Avoid extracting lambda body content as method names
    }
}