import {
  workspace, window, ExtensionContext, Uri
} from 'vscode';
import {
  COMMAND_CLEAR_SELECTION,
  COMMAND_REFRESH_SERVICES,
  COMMAND_SELECT_PROJECT, COMMAND_GO_TO_IMPL, COMMAND_GO_TO_SITE,
  GLOBAL_STATE_KEY,
  MESSAGE_CLEARED_SELECTION,
  MESSAGE_NO_PROJECTS, MESSAGE_REFRESHED, MESSAGE_NO_IMPL,
  PROJECT_PATTERNS
} from './const';
import {
  refreshProviders,
  logCommand,
  navigateToLocation,
  registerCommand
} from './utils';


async function findProjectFiles(_context: ExtensionContext): Promise<Uri[]> {
  const allProjects: Uri[] = [];
  try {
    for (const pattern of PROJECT_PATTERNS) {
      try {
        const files = await workspace.findFiles(pattern);
        allProjects.push(...files);
      } catch (error) {
        console.error(`Error scanning pattern ${pattern}: ${error}`);
        window.showWarningMessage(`Scan failed for ${pattern}`);
      }
    }
    // Deduplicate
    const uniqueProjects = Array.from(new Set(allProjects.map(uri => uri.fsPath)))
      .map(fsPath => Uri.file(fsPath));

    return uniqueProjects;
  } catch (error) {
    console.error(`Error in findProjectFiles: ${error}`);
    window.showWarningMessage('Failed to find projects. Check workspace permissions.');
    return [];
  }
}

export function registerCommands(context: ExtensionContext) {
  registerCommand(context, COMMAND_SELECT_PROJECT, async () => {
    const allProjects = await findProjectFiles(context);
    if (allProjects.length === 0) {
      window.showErrorMessage(MESSAGE_NO_PROJECTS);
      return;
    }
    const projectPaths = allProjects.map(uri => uri.fsPath);
    await context.globalState.update(GLOBAL_STATE_KEY, projectPaths);
    await refreshProviders();
    window.showInformationMessage(`Scanned ${allProjects.length} projects for DI registrations.`);
    logCommand('Select Project');
  });
  registerCommand(context, COMMAND_CLEAR_SELECTION, async () => {
    logCommand('Clear Selection');
    await context.globalState.update(GLOBAL_STATE_KEY, undefined);
    await refreshProviders();
    window.showInformationMessage(MESSAGE_CLEARED_SELECTION);
  });
  registerCommand(context, COMMAND_REFRESH_SERVICES, async () => {
    logCommand('Refresh Services');
    await refreshProviders();
    window.showInformationMessage(MESSAGE_REFRESHED);
  });
  registerCommand(context, COMMAND_GO_TO_IMPL, async (service: any) => {
    logCommand('Go to Implementation');
    if (!service || !service.registrations || service.registrations.length === 0) {
      window.showErrorMessage(MESSAGE_NO_IMPL);
      return;
    }
    const registration = service.registrations[0];
    await navigateToLocation(registration.filePath, registration.lineNumber);
  });
  registerCommand(context, COMMAND_GO_TO_SITE, async (serviceOrSite: any) => {
    logCommand('Go to Injection Site');

    let injectionSite: any;

    // Check if the parameter is an injection site directly or a service with injection sites
    if (serviceOrSite && serviceOrSite.filePath && serviceOrSite.lineNumber && serviceOrSite.className) {
      // Direct injection site object
      injectionSite = serviceOrSite;
    } else if (serviceOrSite && serviceOrSite.injectionSites && serviceOrSite.injectionSites.length > 0) {
      // Service object with injection sites
      injectionSite = serviceOrSite.injectionSites[0];
    } else {
      window.showErrorMessage('No injection sites found for this service.');
      return;
    }

    await navigateToLocation(injectionSite.filePath, injectionSite.lineNumber);
  });
}