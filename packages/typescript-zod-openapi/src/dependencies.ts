import type { AnySchema } from "./types/types";

/**
 * Extracts all schema references ($ref) from an OpenAPI schema by recursively
 * traversing its structure.
 *
 * This function is used during the OpenAPI-to-Zod conversion process to identify
 * which schemas a given schema depends on. It traverses all OpenAPI schema
 * structures including objects, arrays, unions (oneOf), intersections (allOf),
 * conditionals (if/then/else), and discriminator mappings to find all $ref
 * references that point to other schemas in the components/schemas section.
 *
 * The extracted dependency names are used by `topologicalSortSchemas` to build
 * a dependency graph and determine the correct order for generating Zod schemas,
 * ensuring that referenced schemas are defined before they are used in the
 * generated TypeScript code.
 *
 * @param schema - The OpenAPI schema to extract dependencies from
 * @returns An array of schema names that this schema references (via $ref)
 */
export function extractSchemaDependencies(schema: AnySchema): string[] {
  const dependencies: Set<string> = new Set();
  const visited = new WeakSet();

  function traverse(obj: any): void {
    if (!obj || typeof obj !== "object") return;

    if (visited.has(obj)) return;
    visited.add(obj);

    if (obj["$ref"] && typeof obj["$ref"] === "string") {
      const match = (obj["$ref"] as string).match(
        /#\/components\/schemas\/(.+)/,
      );
      if (match && match[1]) {
        dependencies.add(decodeURIComponent(match[1]));
      }
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(traverse);
      return;
    }

    if (obj.properties && typeof obj.properties === "object") {
      for (const propValue of Object.values(obj.properties)) {
        traverse(propValue);
      }
    }

    const schemaKeys = [
      "items",
      "oneOf",
      "allOf",
      "anyOf",
      "not",
      "if",
      "then",
      "else",
      "prefixItems",
      "contains",
      "propertyNames",
      "dependentSchemas",
    ];

    for (const key of schemaKeys) {
      if (obj[key]) {
        traverse(obj[key]);
      }
    }

    if (
      obj.additionalProperties &&
      typeof obj.additionalProperties === "object"
    ) {
      traverse(obj.additionalProperties);
    }

    if (obj.discriminator?.mapping) {
      Object.values(obj.discriminator.mapping).forEach(traverse);
    }
  }

  traverse(schema);
  return Array.from(dependencies);
}

/**
 * Sorts OpenAPI schemas topologically based on their dependencies to ensure
 * correct generation order.
 *
 * When converting OpenAPI schemas to Zod schemas and generating TypeScript code,
 * schemas must be defined before they are referenced. For example, if `UserSchema`
 * references `ProfileSchema` (via $ref), then `ProfileSchema` must be generated
 * before `UserSchema` to avoid "undefined variable" errors in the generated code.
 *
 * This function uses Kahn's algorithm for topological sorting to order schemas
 * such that all dependencies come before their dependents. It:
 * 1. Extracts dependencies for each schema using `extractSchemaDependencies`
 * 2. Builds a dependency graph and computes in-degrees
 * 3. Sorts schemas starting with those that have no dependencies (in-degree 0)
 * 4. Handles circular dependencies gracefully by appending any remaining schemas
 *    that couldn't be sorted (though this indicates a problematic schema structure)
 *
 * This function is called by `openApiToZodTsCode` to determine the order in which
 * schemas should be converted and emitted in the generated TypeScript file.
 *
 * @param schemas - A record mapping schema names to their OpenAPI schema definitions
 * @returns An array of schema names sorted in topological order (dependencies before dependents)
 */
export function topologicalSortSchemas(
  schemas: Record<string, AnySchema>,
): string[] {
  const schemaNames = Object.keys(schemas);
  const dependencies: Map<string, string[]> = new Map();
  const inDegree: Map<string, number> = new Map();
  const sorted: string[] = [];
  const queue: string[] = [];
  const dependents: Map<string, string[]> = new Map();

  for (const name of schemaNames) {
    dependencies.set(name, []);
    dependents.set(name, []);
    inDegree.set(name, 0);
  }

  for (const name of schemaNames) {
    const schemaValue = schemas[name];
    if (schemaValue) {
      const deps = extractSchemaDependencies(schemaValue);
      const validDeps = deps.filter((dep) => schemaNames.includes(dep));
      dependencies.set(name, validDeps);

      for (const dep of validDeps) {
        const currentDependents = dependents.get(dep) || [];
        currentDependents.push(name);
        dependents.set(dep, currentDependents);
      }
    }
  }

  for (const [name, deps] of dependencies.entries()) {
    inDegree.set(name, deps.length);
  }

  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) {
      queue.push(name);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    const currentDependents = dependents.get(current) || [];
    for (const dependent of currentDependents) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  if (sorted.length !== schemaNames.length) {
    for (const name of schemaNames) {
      if (!sorted.includes(name)) {
        sorted.push(name);
      }
    }
  }

  return sorted;
}
