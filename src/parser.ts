import TreeSitter from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import { Registration, Lifetime, InjectionSite } from './models';
import {
  ADD_PREFIX, CONSTRUCTOR, FACTORY,
  IDENTIFIER, PARAMETER,
  REFERENCE, SCOPED_SUFFIX,
  SERVICES, SINGLETON_SUFFIX,
  TRANSIENT_SUFFIX, UNKNOWN
} from './const';

const isServicesChain = (node: any): boolean => {
  if (node.type === 'identifier' && node.text.toLowerCase() === SERVICES) {
    return true;
  }
  if (node.type === 'member_access_expression') {
    const object = node.childForFieldName('object');
    return !!object && isServicesChain(object);
  }
  return false;
};

const isValidDIMethod = (methodName: string): boolean =>
  methodName.startsWith(ADD_PREFIX) &&
  (methodName.endsWith(SINGLETON_SUFFIX) ||
    methodName.endsWith(SCOPED_SUFFIX) ||
    methodName.endsWith(TRANSIENT_SUFFIX));

const getLifetimeFromMethod = (methodName: string): Lifetime => {
  if (methodName.includes(SINGLETON_SUFFIX)) {
    return Lifetime.Singleton;
  } else if (methodName.includes(SCOPED_SUFFIX)) {
    return Lifetime.Scoped;
  } else {
    return Lifetime.Transient;
  }
};

const extractTypeArguments = (nameNode: any): { serviceType: string; implType: string } => {
  const typeArgs = nameNode.childForFieldName('type_arguments');
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

const extractImplFromArguments = (argList: any, serviceType: string): string => {
  if (!argList || argList.namedChildren?.length === 0) {
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

const extractConstructorInjectionSites = (constructorNode: any, className: string, filePath: string): InjectionSite[] => {
  const sites: InjectionSite[] = [];
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
  if (!parser.instance) {
    parser.instance = new TreeSitter();
    parser.instance.setLanguage(CSharp);
  }
  return parser.instance;
};

export const parseCsharp = (sourceCode: string): any => {
  const p = initializeParser();
  const tree = p.parse(sourceCode);
  return tree.rootNode;
};

// Extract DI registrations from syntax tree
export const extractRegistrations = (rootNode: any, filePath: string): Registration[] => {
  const registrations: Registration[] = [];

  function traverse(node: any) {
    if (node.type === 'invocation_expression') {
      const functionNode = node.childForFieldName('function');
      console.log(`Invocation function type: ${functionNode?.type}`); // Debug
      if (functionNode?.type === 'member_access_expression') {
        const nameNode = functionNode.childForFieldName('name');
        if (isServicesChain(functionNode) && nameNode?.type === 'generic_name') {
          const methodName = nameNode.text;
          console.log(`Potential DI method on services: ${methodName}`); // Debug
          if (isValidDIMethod(methodName)) {
            const lifetime = getLifetimeFromMethod(methodName);

            const { serviceType, implType } = extractTypeArguments(nameNode);

            // Handle factory or instance arguments if needed
            const argList = node.namedChildren?.find((child: any) => child.type === 'argument_list');
            const finalImplType = extractImplFromArguments(argList, serviceType);

            console.log(`Found registration: ${serviceType} -> ${finalImplType} (${lifetime})`); // Debug
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

    // Recurse children
    for (const child of node.children ?? []) {
      traverse(child);
    }
  }

  traverse(rootNode);
  return registrations;
};

// Extract injection sites (e.g., constructor parameters) from syntax tree
export const extractInjectionSites = (rootNode: any, filePath: string): InjectionSite[] => {
  const injectionSites: InjectionSite[] = [];

  function traverse(node: any) {
    if (node.type === 'class_declaration') {
      const classNameNode = node.childForFieldName('name');
      const className = classNameNode?.text ?? 'UnknownClass';

      // Look for constructor
      const constructorNode = node.children?.find((child: any) => child.type === 'constructor_declaration');
      if (constructorNode) {
        const sites = extractConstructorInjectionSites(constructorNode, className, filePath);
        injectionSites.push(...sites);
      }

      // Recurse for nested classes or methods (basic: only class level)
      for (const child of node.children ?? []) {
        traverse(child);
      }
    }
  }

  traverse(rootNode);
  return injectionSites;
};