import TreeSitter from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import { Registration, Lifetime, InjectionSite } from './models';

let parser: any = null;

export function initializeParser(): any {
  if (!parser) {
    parser = new TreeSitter();
    parser.setLanguage(CSharp);
  }
  return parser;
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
      const nameNode = node.childForFieldName('function');
      if (nameNode && nameNode.type === 'identifier' && nameNode.text) {
        const methodName = nameNode.text;
        if (methodName.startsWith('Add') && (methodName.endsWith('Singleton') || methodName.endsWith('Scoped') || methodName.endsWith('Transient'))) {
          // Check if called on services (simplified: look for parent member_access with 'services')
          const parent = node.parent;
          if (parent && parent.type === 'arguments' && parent.parent && parent.parent.type === 'member_access_expression') {
            const memberName = parent.parent.childForFieldName('name');
            if (memberName && memberName.text === 'services') {
              // Extract lifetime
              let lifetime: Lifetime;
              if (methodName.includes('Singleton')) { lifetime = Lifetime.Singleton; }
              else if (methodName.includes('Scoped')) { lifetime = Lifetime.Scoped; }
              else { lifetime = Lifetime.Transient; }

              // Simplified extraction: assume generic arguments for service and impl
              const argsNode = node.childForFieldName('arguments');
              if (argsNode && argsNode.namedChildren.length >= 2) {
                const serviceType = argsNode.namedChildren[0].text || 'Unknown';
                const implType = argsNode.namedChildren[1].text || 'Unknown';

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
    }

    // Recurse children
    for (const child of node.children || []) {
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
      const className = classNameNode ? classNameNode.text : 'UnknownClass';

      // Look for constructor
      const constructorNode = node.children?.find((child: any) => child.type === 'constructor_declaration');
      if (constructorNode) {
        const paramsNode = constructorNode.childForFieldName('parameters');
        if (paramsNode && paramsNode.type === 'parameter_list') {
          for (const paramNode of paramsNode.namedChildren || []) {
            if (paramNode.type === 'parameter') {
              const typeNode = paramNode.childForFieldName('type');
              if (typeNode && (typeNode.type === 'simple_type' || typeNode.type === 'qualified_name')) {
                const serviceType = typeNode.text || 'UnknownType';
                const lineNumber = paramNode.startPosition.row + 1;

                injectionSites.push({
                  filePath,
                  lineNumber,
                  className,
                  memberName: constructorNode.text || 'constructor',
                  type: 'constructor',
                  serviceType
                });
              }
            }
          }
        }
      }

      // Recurse for nested classes or methods (basic: only class level)
      for (const child of node.children || []) {
        traverse(child);
      }
    }
  }

  traverse(rootNode);
  return injectionSites;
}

// Future: Enhanced traversal for extension methods, attributes, etc.