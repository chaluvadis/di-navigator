import { Registration, Lifetime, InjectionSite } from './models';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import {
  ADD_PREFIX,
  SCOPED_SUFFIX,
  SINGLETON_SUFFIX,
  TRANSIENT_SUFFIX
} from './const';

export const isValidDIMethod = (methodName: string): boolean =>
  methodName.startsWith(ADD_PREFIX) &&
  (methodName.endsWith(SINGLETON_SUFFIX) ||
    methodName.endsWith(SCOPED_SUFFIX) ||
    methodName.endsWith(TRANSIENT_SUFFIX));

export const getLifetimeFromMethod = (methodName: string): Lifetime => {
  if (methodName.includes(SINGLETON_SUFFIX)) {
    return Lifetime.Singleton;
  } else if (methodName.includes(SCOPED_SUFFIX)) {
    return Lifetime.Scoped;
  } else {
    return Lifetime.Transient;
  }
};

export const parseCsharp = (sourceCode: string): null => {
  // No AST return, use Roslyn tool via CLI
  console.log(`source code : ${sourceCode}`);
  return null;
};

export const extractRegistrations = (filePath: string, sourceCode?: string): Registration[] => {
  const registrations: Registration[] = [];

  // Use Roslyn tool
  try {
    const toolPath = './tools/roslyn-di-analyzer/bin/Debug/net8.0/roslyn-di-analyzer.dll';
    if (existsSync(toolPath)) {
      const command = `dotnet "${toolPath}" --file "${filePath}"`;
      const output = execSync(command, { encoding: 'utf8' });
      const result = JSON.parse(output);
      for (const reg of result.Registrations) {
        const lifetime = getLifetimeFromMethod(reg.MethodCall);
        registrations.push({
          lifetime,
          serviceType: reg.ServiceType,
          implementationType: reg.ImplementationType,
          name: undefined,
          filePath: reg.FilePath,
          lineNumber: reg.LineNumber,
          methodCall: reg.MethodCall
        });
      }
    } else {
      console.warn('Roslyn tool not built, falling back to regex.');
      // Fallback regex
      let fullSource = sourceCode ?? '';
      if (!fullSource) {
        fullSource = require('fs').readFileSync(filePath, 'utf8');
      }
      const diRegex = /services\.(Add(?:Singleton|Scoped|Transient))\s*<([^>]+)>(?:\s*,\s*([^>]+))?\s*\(\s*(new\s+[^)]+)?\s*\)/g;
      let match: RegExpExecArray | null;
      while ((match = diRegex.exec(fullSource)) !== null) {
        const methodName = match[1];
        const lifetime = getLifetimeFromMethod(methodName);
        const serviceType = match[2].trim();
        const implType = match[3] ? match[3].trim() : serviceType;
        const lineNumber = fullSource.substring(0, match.index).split('\n').length;
        registrations.push({
          lifetime,
          serviceType,
          implementationType: implType,
          name: undefined,
          filePath,
          lineNumber,
          methodCall: methodName
        });
      }
    }
  } catch (error) {
    console.error('Error running Roslyn tool:', error);
    // Fallback to regex as above
  }

  return registrations;
};

export const extractInjectionSites = (filePath: string, sourceCode?: string): InjectionSite[] => {
  const injectionSites: InjectionSite[] = [];

  // Use Roslyn tool
  try {
    const toolPath = './tools/roslyn-di-analyzer/bin/Debug/net8.0/roslyn-di-analyzer.dll';
    if (existsSync(toolPath)) {
      const command = `dotnet "${toolPath}" --file "${filePath}"`;
      const output = execSync(command, { encoding: 'utf8' });
      const result = JSON.parse(output);
      for (const site of result.InjectionSites) {
        injectionSites.push({
          filePath: site.FilePath,
          lineNumber: site.LineNumber,
          className: site.ClassName,
          memberName: site.MemberName,
          type: site.Type as 'constructor' | 'field',
          serviceType: site.ServiceType
        });
      }
    } else {
      console.warn('Roslyn tool not built, falling back to regex.');
      // Fallback regex
      let fullSource = sourceCode ?? '';
      if (!fullSource) {
        fullSource = require('fs').readFileSync(filePath, 'utf8');
      }
      // Constructor params
      const ctorRegex = /public\s+([\w\.]+)\s*\(\s*([\w<>\.]+)\s+([\w]+)(?:\s*,\s*([\w<>\.]+)\s+([\w]+))*\s*\)/g;
      let ctorMatch: RegExpExecArray | null;
      while ((ctorMatch = ctorRegex.exec(fullSource)) !== null) {
        const className = ctorMatch[1];
        const serviceType = ctorMatch[2];
        const memberName = ctorMatch[3];
        const lineNumber = fullSource.substring(0, ctorMatch.index).split('\n').length + 1;
        injectionSites.push({
          filePath,
          lineNumber,
          className,
          memberName,
          type: 'constructor',
          serviceType
        });
      }
      // Fields
      const fieldRegex = /private\s+(readonly\s+)?([\w<>\.]+)\s+([\w_]+);/g;
      let fieldMatch: RegExpExecArray | null;
      while ((fieldMatch = fieldRegex.exec(fullSource)) !== null) {
        const serviceType = fieldMatch[2];
        const memberName = fieldMatch[3];
        const classMatch = fullSource.substring(0, fieldMatch.index).match(/public\s+class\s+([\w]+)/);
        const className = classMatch ? classMatch[1] : '';
        const lineNumber = fullSource.substring(0, fieldMatch.index).split('\n').length + 1;
        injectionSites.push({
          filePath,
          lineNumber,
          className,
          memberName,
          type: 'field',
          serviceType
        });
      }
    }
  } catch (error) {
    console.error('Error running Roslyn tool for injection sites:', error);
    // Fallback to regex as above
  }

  return injectionSites;
};