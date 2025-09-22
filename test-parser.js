const { JSDIParser } = require('./out/jsDiParser');
const path = require('path');

async function testParser() {
    console.log('Testing DI Parser with test project...');

    const parser = new JSDIParser();
    const testProjectPath = path.join(__dirname, 'test-project');

    try {
        const result = await parser.parseProject(testProjectPath);

        console.log('\n=== PARSING RESULTS ===');
        console.log(`Project: ${result.projectName}`);
        console.log(`Parse Status: ${result.parseStatus}`);
        console.log(`Service Groups: ${result.serviceGroups.length}`);

        if (result.errorDetails && result.errorDetails.length > 0) {
            console.log('\n=== ERRORS ===');
            result.errorDetails.forEach(error => console.log(`- ${error}`));
        }

        result.serviceGroups.forEach((group, groupIndex) => {
            console.log(`\n[${groupIndex}] ${group.lifetime} (${group.services.length} services)`);

            group.services.forEach((service, serviceIndex) => {
                console.log(`  [${serviceIndex}] ${service.name}`);
                console.log(`    - Registrations: ${service.registrations.length}`);
                service.registrations.forEach((reg, regIndex) => {
                    console.log(`      [${regIndex}] ${reg.methodCall} -> ${reg.serviceType} : ${reg.implementationType}`);
                });
                console.log(`    - Injection Sites: ${service.injectionSites.length}`);
                service.injectionSites.forEach((site, siteIndex) => {
                    console.log(`      [${siteIndex}] ${site.className}.${site.memberName} (${site.serviceType})`);
                });
            });
        });

    } catch (error) {
        console.error('Error testing parser:', error);
    }
}

testParser();