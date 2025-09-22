const fs = require('fs');
const path = require('path');

// Simple regex test for DI patterns
function testRegexPatterns() {
    console.log('Testing DI regex patterns...\n');

    const testCases = [
        // Singleton patterns from jsDiParser.ts
        { pattern: /services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddSingleton<IUserService, UserService>();', expected: ['IUserService', 'UserService'] },
        { pattern: /builder\.Services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'builder.Services.AddSingleton<IOrderService, OrderService>();', expected: ['IOrderService', 'OrderService'] },
        { pattern: /services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g, input: 'services.AddSingleton<IUserService, UserService>(config);', expected: ['IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g, input: 'services.AddSingleton<IUserService, UserService>(config);', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddSingleton<IUserService, UserService>();', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton<([^>]+)>\s*\(\s*\)/g, input: 'services.AddSingleton<ISystemClock, SystemClock>();', expected: ['services', 'ISystemClock'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g, input: 'services.AddSingleton<IUserService, UserService>();', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddSingleton<IUserService>(provider => new UserService());', expected: ['services', 'IUserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddSingleton<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddSingleton<IUserService, UserService>(provider => new UserService());', expected: ['services', 'IUserService', 'UserService'] },

        // Scoped patterns from jsDiParser.ts
        { pattern: /services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddScoped<IOrderService, OrderService>();', expected: ['IOrderService', 'OrderService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g, input: 'services.AddScoped<IOrderService, OrderService>(config);', expected: ['services', 'IOrderService', 'OrderService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddScoped<IOrderService, OrderService>();', expected: ['services', 'IOrderService', 'OrderService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped<([^>]+)>\s*\(\s*\)/g, input: 'services.AddScoped<IOrchestratorRepository, SQLiteOrchestratorRepository>();', expected: ['services', 'IOrchestratorRepository'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g, input: 'services.AddScoped<IOrderService, OrderService>();', expected: ['services', 'IOrderService', 'OrderService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddScoped<IOrderService>(provider => new OrderService());', expected: ['services', 'IOrderService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddScoped<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddScoped<IOrderService, OrderService>(provider => new OrderService());', expected: ['services', 'IOrderService', 'OrderService'] },

        // Transient patterns from jsDiParser.ts
        { pattern: /services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddTransient<AdminService>();', expected: ['AdminService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient\s*<([^,>]+)(?:,\s*([^>]+))?\s*\([^)]*\)/g, input: 'services.AddTransient<IUserService, UserService>(config);', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g, input: 'services.AddTransient<IUserService, UserService>();', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient<([^>]+)>\s*\(\s*\)/g, input: 'services.AddTransient<IService, Implementation>();', expected: ['services', 'IService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient<([^,>]+),\s*([^>]+)>\s*\(\s*\)/g, input: 'services.AddTransient<IUserService, UserService>();', expected: ['services', 'IUserService', 'UserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddTransient<IUserService>(provider => new UserService());', expected: ['services', 'IUserService'] },
        { pattern: /(\w+(?:\.\w+)*)\.AddTransient<([^,>]+),\s*([^>]+)>\s*\(\s*[^)]*\)\s*=>/g, input: 'services.AddTransient<IUserService, UserService>(provider => new UserService());', expected: ['services', 'IUserService', 'UserService'] },
    ];

    let passed = 0;
    let failed = 0;

    testCases.forEach((testCase, index) => {
        const match = testCase.pattern.exec(testCase.input);
        if (match) {
            const actual = match.slice(1).filter(m => m); // Remove full match and empty captures
            const success = JSON.stringify(actual) === JSON.stringify(testCase.expected);
            console.log(`Test ${index + 1}: ${success ? 'PASS' : 'FAIL'}`);
            console.log(`  Input: ${testCase.input}`);
            console.log(`  Expected: [${testCase.expected.join(', ')}]`);
            console.log(`  Actual: [${actual.join(', ')}]`);
            if (success) passed++;
            else failed++;
            console.log('');
        } else {
            console.log(`Test ${index + 1}: FAIL - No match found`);
            console.log(`  Input: ${testCase.input}`);
            console.log(`  Expected: [${testCase.expected.join(', ')}]`);
            console.log('');
            failed++;
        }
    });

    console.log(`Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Test injection patterns
function testInjectionPatterns() {
    console.log('Testing injection patterns...\n');

    const testCases = [
        // Constructor injection
        { pattern: /class\s+(\w+(?:\.\w+)*)\s*[:\w\s,]*\([^)]*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+/g, input: 'public class OrderService(IUserService userService)', expected: ['OrderService', 'IUserService'] },
        { pattern: /public\s+(\w+(?:\.\w+)*)\s*\(\s*[^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^)]*\)/g, input: 'public OrderService(IUserService userService)', expected: ['OrderService', 'IUserService'] },

        // GetRequiredService patterns
        { pattern: /GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g, input: 'GetRequiredService<IUserService>();', expected: ['IUserService'] },
        { pattern: /(?:ServiceProvider|sp)\.GetRequiredService<([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)>/g, input: 'sp.GetRequiredService<IOrderService>();', expected: ['IOrderService'] },
    ];

    let passed = 0;
    let failed = 0;

    testCases.forEach((testCase, index) => {
        const match = testCase.pattern.exec(testCase.input);
        if (match) {
            const actual = match.slice(1).filter(m => m);
            const success = JSON.stringify(actual) === JSON.stringify(testCase.expected);
            console.log(`Injection Test ${index + 1}: ${success ? 'PASS' : 'FAIL'}`);
            console.log(`  Input: ${testCase.input}`);
            console.log(`  Expected: [${testCase.expected.join(', ')}]`);
            console.log(`  Actual: [${actual.join(', ')}]`);
            if (success) passed++;
            else failed++;
            console.log('');
        } else {
            console.log(`Injection Test ${index + 1}: FAIL - No match found`);
            console.log(`  Input: ${testCase.input}`);
            console.log(`  Expected: [${testCase.expected.join(', ')}]`);
            console.log('');
            failed++;
        }
    });

    console.log(`Injection Results: ${passed} passed, ${failed} failed`);
    return failed === 0;
}

// Test the actual test project file
function testWithTestProject() {
    console.log('Testing with actual test project...\n');

    const testFilePath = path.join(__dirname, 'test-project', 'Program.cs');
    try {
        const content = fs.readFileSync(testFilePath, 'utf8');

        // Test registration patterns - need to handle indentation and lambda context
        const singletonPattern = /services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const scopedPattern = /services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const transientPattern = /services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const factoryPattern = /services\.AddTransient<([^>]+)>\s*\(\s*[^)]*\)\s*=>/g;

        // More flexible patterns that handle indentation
        const flexibleSingletonPattern = /(\w+(?:\.\w+)*)\.AddSingleton\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const flexibleScopedPattern = /(\w+(?:\.\w+)*)\.AddScoped\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const flexibleTransientPattern = /(\w+(?:\.\w+)*)\.AddTransient\s*<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;

        // Patterns that handle indentation and whitespace
        const indentedSingletonPattern = /\s*services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const indentedScopedPattern = /\s*services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const indentedTransientPattern = /\s*services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;

        // Patterns that handle the exact format in the test project
        const lambdaSingletonPattern = /\s*services\.AddSingleton<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const lambdaScopedPattern = /\s*services\.AddScoped<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;
        const lambdaTransientPattern = /\s*services\.AddTransient<([^,>]+)(?:,\s*([^>]+))?\s*\)/g;

        let matches = [];
        let match;

        console.log('Testing singleton registrations:');
        while ((match = singletonPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        console.log('\nTesting scoped registrations:');
        scopedPattern.lastIndex = 0; // Reset regex
        while ((match = scopedPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        console.log('\nTesting transient registrations:');
        transientPattern.lastIndex = 0; // Reset regex
        while ((match = transientPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        console.log('\nTesting factory registrations:');
        factoryPattern.lastIndex = 0; // Reset regex
        while ((match = factoryPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}`);
            matches.push(match);
        }

        // Test flexible patterns
        console.log('\nTesting flexible singleton registrations:');
        flexibleSingletonPattern.lastIndex = 0;
        while ((match = flexibleSingletonPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[2]}, Implementation: ${match[3] || match[2]}`);
            matches.push(match);
        }

        console.log('\nTesting flexible scoped registrations:');
        flexibleScopedPattern.lastIndex = 0;
        while ((match = flexibleScopedPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[2]}, Implementation: ${match[3] || match[2]}`);
            matches.push(match);
        }

        console.log('\nTesting flexible transient registrations:');
        flexibleTransientPattern.lastIndex = 0;
        while ((match = flexibleTransientPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[2]}, Implementation: ${match[3] || match[2]}`);
            matches.push(match);
        }

        // Test indented patterns
        console.log('\nTesting indented singleton registrations:');
        indentedSingletonPattern.lastIndex = 0;
        while ((match = indentedSingletonPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        console.log('\nTesting indented scoped registrations:');
        indentedScopedPattern.lastIndex = 0;
        while ((match = indentedScopedPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        console.log('\nTesting indented transient registrations:');
        indentedTransientPattern.lastIndex = 0;
        while ((match = indentedTransientPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Service: ${match[1]}, Implementation: ${match[2] || match[1]}`);
            matches.push(match);
        }

        // Test constructor injection
        const constructorPattern = /public\s+(\w+(?:\.\w+)*)\s*\(\s*[^)]*?([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)\s+\w+[^)]*\)/g;
        console.log('\nTesting constructor injection:');
        constructorPattern.lastIndex = 0;
        while ((match = constructorPattern.exec(content)) !== null) {
            console.log(`  Found: ${match[0]} -> Class: ${match[1]}, Service: ${match[2]}`);
        }

    } catch (error) {
        console.error('Error reading test file:', error.message);
    }
}

// Run all tests
function runAllTests() {
    console.log('='.repeat(50));
    console.log('DI PARSER REGEX PATTERN TESTS');
    console.log('='.repeat(50));

    const regexTestsPassed = testRegexPatterns();
    const injectionTestsPassed = testInjectionPatterns();
    testWithTestProject();

    console.log('\n' + '='.repeat(50));
    console.log('SUMMARY');
    console.log('='.repeat(50));
    console.log(`Regex Tests: ${regexTestsPassed ? 'PASS' : 'FAIL'}`);
    console.log(`Injection Tests: ${injectionTestsPassed ? 'PASS' : 'FAIL'}`);
    console.log('='.repeat(50));
}

runAllTests();