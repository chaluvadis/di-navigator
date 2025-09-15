import TreeSitter from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import { Registration, Lifetime, InjectionSite } from './models';

const parser = { instance: null as any };

export function initializeParser(): any {
  if (!parser.instance) {
    parser.instance = new TreeSitter();
    parser.instance.setLanguage(CSharp);
  }
  return parser.instance;
}

export function parseCsharp(sourceCode: string): any {
  const p = initializeParser();
  const tree = p.parse(sourceCode);
  return tree.rootNode;
}

// Extract DI registrations from syntax tree
export function extractRegistrations(rootNode: any, filePath: string): Registration[] {
  const registrations: Registration[] = [];

  function traverse(node: any) {
    if (node.type === 'invocation_expression') {
      const functionNode = node.childForFieldName('function');
      console.log(`Invocation function type: ${functionNode?.type}`); // Debug
      if (functionNode?.type === 'member_access_expression') {
        const objectNode = functionNode.childForFieldName('object');
        const nameNode = functionNode.childForFieldName('name');
        if (objectNode?.type === 'identifier' && objectNode.text === 'services' && nameNode?.type === 'generic_name') {
          const methodName = nameNode.text;
          console.log(`Potential DI method: ${methodName}`); // Debug
          if (methodName.startsWith('Add') && (methodName.endsWith('Singleton') || methodName.endsWith('Scoped') || methodName.endsWith('Transient'))) {
            // Extract lifetime
            let lifetime: Lifetime;
            if (methodName.includes('Singleton')) { lifetime = Lifetime.Singleton; }
            else if (methodName.includes('Scoped')) { lifetime = Lifetime.Scoped; }
            else { lifetime = Lifetime.Transient; }

            // Extract generic type arguments
            const typeArgs = nameNode.childForFieldName('type_arguments');
            if (typeArgs?.type === 'type_argument_list' && typeArgs.namedChildren?.length >= 2) {
              const serviceType = typeArgs.namedChildren[0].text ?? 'Unknown';
              const implType = typeArgs.namedChildren[1].text ?? 'Unknown';

              console.log(`Found registration: ${serviceType} -> ${implType} (${lifetime})`); // Debug
              registrations.push({
                lifetime,
                serviceType,
                implementationType: implType,
                filePath,
                lineNumber: node.startPosition.row + 1,
                methodCall: methodName
              });
            }
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
}

// Extract injection sites (e.g., constructor parameters) from syntax tree
export function extractInjectionSites(rootNode: any, filePath: string): InjectionSite[] {
  const injectionSites: InjectionSite[] = [];

  function traverse(node: any) {
    if (node.type === 'class_declaration') {
      const classNameNode = node.childForFieldName('name');
      const className = classNameNode?.text ?? 'UnknownClass';

      // Look for constructor
      const constructorNode = node.children?.find((child: any) => child.type === 'constructor_declaration');
      if (constructorNode) {
        const paramsNode = constructorNode.childForFieldName('parameters');
        if (paramsNode?.type === 'parameter_list') {
          for (const paramNode of paramsNode.namedChildren ?? []) {
            if (paramNode.type === 'parameter') {
              const typeNode = paramNode.childForFieldName('type');
              if (typeNode && (typeNode.type === 'simple_type' || typeNode.type === 'qualified_name')) {
                const serviceType = typeNode.text ?? 'UnknownType';
                const lineNumber = paramNode.startPosition.row + 1;

                injectionSites.push({
                  filePath,
                  lineNumber,
                  className,
                  memberName: constructorNode.text ?? 'constructor',
                  type: 'constructor' as const,
                  serviceType
                });
              }
            }
          }
        }
      }

      // Recurse for nested classes or methods (basic: only class level)
      for (const child of node.children ?? []) {
        traverse(child);
      }
    }
  }

  traverse(rootNode);
  return injectionSites;
}

// Future: Enhanced traversal for extension methods, attributes, etc.