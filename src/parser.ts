import { Registration, Lifetime, InjectionSite } from './models';
import {
  ADD_PREFIX, CONSTRUCTOR, FACTORY,
  IDENTIFIER, PARAMETER,
  REFERENCE, SCOPED_SUFFIX,
  SERVICES, SINGLETON_SUFFIX,
  TRANSIENT_SUFFIX, UNKNOWN
} from './const';

let TreeSitter: any = null;
let CSharp: any = null;
let useTreeSitter = false;

const loadTreeSitter = (): boolean => {
  try {
    if (!TreeSitter) {
      TreeSitter = require('tree-sitter');
      CSharp = require('tree-sitter-c-sharp');
    }
    useTreeSitter = true;
    console.log('Tree-sitter loaded successfully for C# parsing.');
    return true;
  } catch (error) {
    console.warn('Failed to load tree-sitter-c-sharp natives. Falling back to regex parsing:', (error as Error).message);
    useTreeSitter = false;
    return false;
  }
};

export const isServicesChain = (node: any): boolean => {
  if (node.type === 'identifier' && node.text.toLowerCase() === SERVICES) {
    return true;
  }
  if (node.type === 'member_access_expression') {
    const object = node.childForFieldName('object');
    return !!object && isServicesChain(object);
  }
  return false;
};

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

export const extractTypeArguments = (nameNode: any): { serviceType: string; implType: string } => {
  // For regex fallback, this won't be used, but keep for tree-sitter
  const typeArgs = nameNode?.childForFieldName('type_arguments');
  let serviceType = UNKNOWN;
  let implType = UNKNOWN;

  if (typeArgs?.type === 'type_argument_list') {
    const args = typeArgs.namedChildren;
    if (args.length >= 2) {
      serviceType = args[0].text ?? UNKNOWN;
      implType = args[1].text ?? UNKNOWN;
    } else if (args.length === 1) {
      serviceType = args[0].text ?? UNKNOWN;
      implType = serviceType;
    }
  }

  return { serviceType, implType };
};

export const extractImplFromArguments = (argList: any, serviceType: string): string => {
  // For regex, simplified
  if (!argList || !useTreeSitter) {
    return serviceType;
  }

  const firstArg = argList.namedChildren[0];
  if (firstArg?.type !== 'argument') {
    return serviceType;
  }

  const argValue = firstArg.namedChildren?.[0];
  if (argValue?.type === 'new_expression') {
    const constructorType = argValue.childForFieldName('constructor');
    if (constructorType?.type === 'simple_type' || constructorType?.type === 'qualified_name') {
      return constructorType.text ?? UNKNOWN;
    }
  } else if (argValue?.type === 'lambda_expression') {
    return FACTORY;
  } else if (argValue?.type === IDENTIFIER || argValue?.type === 'this_expression') {
    return argValue.text ?? REFERENCE;
  }

  return serviceType;
};

export const extractConstructorInjectionSites = (constructorNode: any, className: string, filePath: string): InjectionSite[] => {
  const sites: InjectionSite[] = [];
  if (!useTreeSitter) { return sites; } // Regex handles at higher level

  const paramsNode = constructorNode.childForFieldName('parameters');
  if (paramsNode?.type === 'parameter_list') {
    for (const paramNode of paramsNode.namedChildren ?? []) {
      if (paramNode.type === PARAMETER) {
        const typeNode = paramNode.childForFieldName('type');
        if (typeNode && (typeNode.type === 'simple_type' || typeNode.type === 'qualified_name')) {
          const serviceType = typeNode.text ?? UNKNOWN;
          const lineNumber = paramNode.startPosition.row + 1;
          sites.push({
            filePath,
            lineNumber,
            className,
            memberName: constructorNode.text ?? CONSTRUCTOR,
            type: 'constructor' as const,
            serviceType
          });
        }
      }
    }
  }
  return sites;
};

const parser = { instance: null as any };

export const initializeParser = (): any => {
  if (!useTreeSitter) {
    loadTreeSitter();
  }
  if (useTreeSitter && !parser.instance) {
    try {
      parser.instance = new TreeSitter();
      parser.instance.setLanguage(CSharp);
      console.log('Tree-sitter parser initialized successfully.');
    } catch (error) {
      console.warn('Failed to initialize tree-sitter parser:', (error as Error).message);
      useTreeSitter = false;
      parser.instance = null;
    }
  }
  return parser.instance;
};

export const parseCsharp = (sourceCode: string): any => {
  loadTreeSitter(); // Ensure loaded
  if (useTreeSitter) {
    try {
      const p = initializeParser();
      if (p) {
        const tree = p.parse(sourceCode);
        return tree.rootNode;
      }
    } catch (error) {
      console.warn('Tree-sitter parse failed, falling back to regex:', (error as Error).message);
      useTreeSitter = false;
    }
  }
  // Fallback: return null for regex use
  return null;
};

// Extract DI registrations from syntax tree
export const extractRegistrations = (rootNode: any, filePath: string, sourceCode?: string): Registration[] => {
  const registrations: Registration[] = [];

  if (useTreeSitter && rootNode) {
    // Tree-sitter traversal logic (same as before)
    function traverse(node: any) {
      if (node.type === 'invocation_expression') {
        const functionNode = node.childForFieldName('function');
        if (functionNode?.type === 'member_access_expression') {
          const nameNode = functionNode.childForFieldName('name');
          if (isServicesChain(functionNode) && nameNode?.type === 'generic_name') {
            const methodName = nameNode.text;
            if (isValidDIMethod(methodName)) {
              const lifetime = getLifetimeFromMethod(methodName);

              const { serviceType, implType } = extractTypeArguments(nameNode);

              const argList = node.namedChildren?.find((child: any) => child.type === 'argument_list');
              const finalImplType = extractImplFromArguments(argList, serviceType);

              registrations.push({
                lifetime,
                serviceType,
                implementationType: finalImplType,
                filePath,
                lineNumber: node.startPosition.row + 1,
                methodCall: methodName
              });
            }
          }
        }
      }

      for (const child of node.children ?? []) {
        traverse(child);
      }
    }

    traverse(rootNode);
  } else {
    console.log('Using regex fallback for extracting registrations.');
    const lines = sourceCode ? sourceCode.split('\n') : (filePath ? require('fs').readFileSync(filePath, 'utf8').split('\n') : []);
    // Enhanced regex for common DI patterns, including optional spaces, lambdas, typeof, and basic impl extraction
    const regEx = new RegExp(
      `services\\s*\\.\\s*${ADD_PREFIX}([A-Za-z]+)\\s*<\\s*([^,>]+)\\s*(,\\s*([^>]*)\\s*)?>\\s*\\s*\\(\\s*(new\\s+([^)]+)|typeof\\s*\\([^)]+\\)|\\(\\s*[^)]+\\s*=>|([^)]*))?\\s*\\)`,
      'gi'
    );
    lines.forEach((line: string, index: number) => {
      let match;
      regEx.lastIndex = 0;
      while ((match = regEx.exec(line)) !== null) {
        const methodName = `Add${match[1]}`;
        const lifetime = getLifetimeFromMethod(methodName);
        const serviceType = match[2].trim().replace(/[\s;]/g, '');
        let implType = serviceType; // Default to self
        if (match[4]) {
          implType = match[4].trim().replace(/[\s;]/g, '');
        } else if (match[6]) {
          implType = match[6].trim().replace(/[\s;]/g, '');
        } else if (match[7]) {
          implType = match[7].trim().replace(/[\s;]/g, '');
        }
        if (match[8] && match[8].includes('=>')) {
          implType = FACTORY;
        }
        registrations.push({
          lifetime,
          serviceType,
          implementationType: implType || UNKNOWN,
          filePath,
          lineNumber: index + 1,
          methodCall: methodName
        });
      }
    });
  }

  return registrations;
};

// Extract injection sites (e.g., constructor parameters) from syntax tree
export const extractInjectionSites = (rootNode: any, filePath: string, sourceCode?: string): InjectionSite[] => {
  const injectionSites: InjectionSite[] = [];

  if (useTreeSitter && rootNode) {
    // Tree-sitter logic
    function traverse(node: any) {
      if (node.type === 'class_declaration') {
        const classNameNode = node.childForFieldName('name');
        const className = classNameNode?.text ?? 'UnknownClass';

        const constructorNode = node.children?.find((child: any) => child.type === 'constructor_declaration');
        if (constructorNode) {
          const sites = extractConstructorInjectionSites(constructorNode, className, filePath);
          injectionSites.push(...sites);
        }

        for (const child of node.children ?? []) {
          traverse(child);
        }
      }
    }

    traverse(rootNode);
  } else {
    // Regex fallback for injection sites (constructors with params)
    console.log('Using regex fallback for extracting injection sites.');
    const lines = sourceCode ? sourceCode.split('\n') : (filePath ? require('fs').readFileSync(filePath, 'utf8').split('\n') : []);
    let currentClass = '';
    const classRegex = /\s*(public|private|protected|internal)?\s*class\s+(\w+)/gi;
    const ctorRegex = /\s*(public|private|protected|internal)?\s*(\w+)?\s*\(\s*([^)]*)\s*\)\s*\{?/gi;
    lines.forEach((line: string, index: number) => {
      let classMatch: RegExpExecArray | null = classRegex.exec(line);
      if (classMatch) {
        currentClass = classMatch[2];
        classRegex.lastIndex = 0; // Reset for next line
      }
      let ctorMatch: RegExpExecArray | null;
      ctorRegex.lastIndex = 0;
      while ((ctorMatch = ctorRegex.exec(line)) !== null) {
        if (currentClass && ctorMatch[3].trim()) {
          const params = ctorMatch[3].split(',').map(p => p.trim()).filter(p => p);
          params.forEach((param: string) => {
            const typeMatch = param.match(/^(\w+(?:\.\w+)?)\s+(\w+)$/);
            if (typeMatch) {
              const serviceType = typeMatch[1];
              injectionSites.push({
                filePath,
                lineNumber: index + 1,
                className: currentClass,
                memberName: ctorMatch![2] || CONSTRUCTOR,
                type: 'constructor' as const,
                serviceType
              });
            }
          });
        }
      }
    });
  }

  return injectionSites;
};