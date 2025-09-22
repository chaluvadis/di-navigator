import { ProjectDI } from './models';
import { JSDIParser } from './jsDiParser';

export const parseProject = async (projectPath: string, _toolPath: string): Promise<ProjectDI> => {
    console.log(`🔧 DI Navigator: parseProject called for: ${projectPath}`);
    console.log(`🔧 DI Navigator: Tool path (ignored): ${_toolPath}`);

    // Use JavaScript-based parsing instead of Roslyn tool
    console.log('🔧 DI Navigator: Creating JSDIParser instance');
    const jsParser = new JSDIParser();
    console.log('🔧 DI Navigator: Calling jsParser.parseProject()');

    const result = await jsParser.parseProject(projectPath);
    console.log(`🔧 DI Navigator: parseProject completed for ${projectPath}`);
    console.log(`🔧 DI Navigator: Result:`, {
        projectName: result.projectName,
        serviceGroupsCount: result.serviceGroups.length,
        totalServices: result.serviceGroups.reduce((acc, sg) => acc + sg.services.length, 0),
        parseStatus: result.parseStatus
    });

    return result;
};