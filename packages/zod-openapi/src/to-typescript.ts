import { topologicalSortSchemas } from "./dependencies";
import {
  createSchemaRegistry,
  findCommonSchemas,
  getSchemaFingerprint,
  preRegisterSchema,
  registerSchema,
  type SchemaRegistry,
} from "./schema-dedup";
import { convertSchemaToZodString } from "./to-zod";
import type { AnySchema } from "./types/types";
import {
  parseOpenApiPaths,
  generateRouteSchemaNames,
  type RouteInfo,
} from "./routes";
import { generateInterface, schemaExportNameToOutputAlias, schemaExportNameToInputAlias, schemaToInputTypeString } from "./interface-generator";

const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function quotePropertyName(name: string): string {
  return validIdentifierRegex.test(name) ? name : `'${name}'`;
}

function generateRouteSchemaName(
  path: string,
  method: string,
  suffix: string,
): string {
  const pathParts = path
    .split("/")
    .filter((p) => p)
    .map((p) => {
      if (p.startsWith("{") && p.endsWith("}")) {
        return p.slice(1, -1);
      }
      return p;
    })
    .map((word) => {
      // Convert hyphenated words to PascalCase (e.g., "timer-drafts" -> "TimerDrafts")
      return word
        .split(/[-_]/)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
        .join("");
    });
  const methodPrefix = method.charAt(0) + method.slice(1).toLowerCase();
  const parts = [methodPrefix, ...pathParts, suffix];
  return parts.join("");
}

/**
 * Result of route schema generation including declarations and name mappings.
 */
interface RouteSchemaResult {
  /** Schema declarations to be emitted */
  declarations: string[];
  /** Maps route-specific schema name to its canonical name (for deduplication) */
  schemaNameToCanonical: Map<string, string>;
}

function generateRouteSchemas(
  routes: RouteInfo[],
  convertSchema: (schema: AnySchema) => string,
  registry: SchemaRegistry,
): RouteSchemaResult {
  const declarations: string[] = [];
  const schemaNameToCanonical = new Map<string, string>();
  const generatedNames = new Set<string>();

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    // Generate params schema with deduplication
    if (names.paramsSchemaName && pathParams.length > 0) {
      const paramsSchema: AnySchema = {
        type: "object",
        properties: Object.fromEntries(
          pathParams.map((p) => [p.name, p.schema]),
        ),
        required: pathParams.filter((p) => p.required).map((p) => p.name),
      };

      const { isNew, canonicalName } = registerSchema(
        registry,
        names.paramsSchemaName,
        paramsSchema,
      );
      schemaNameToCanonical.set(names.paramsSchemaName, canonicalName);

      if (isNew && !generatedNames.has(names.paramsSchemaName)) {
        generatedNames.add(names.paramsSchemaName);
        const properties: string[] = [];
        for (const param of pathParams) {
          const zodExpr = convertSchema(param.schema);
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
        }
        declarations.push(
          `export const ${names.paramsSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      } else if (!isNew && names.paramsSchemaName !== canonicalName) {
        if (!generatedNames.has(names.paramsSchemaName)) {
          generatedNames.add(names.paramsSchemaName);
          declarations.push(
            `export const ${names.paramsSchemaName} = ${canonicalName};`,
          );
        }
      }
    }

    // Generate query schema with deduplication
    if (names.querySchemaName && queryParams.length > 0) {
      const querySchema: AnySchema = {
        type: "object",
        properties: Object.fromEntries(
          queryParams.map((p) => [p.name, p.schema]),
        ),
        required: queryParams.filter((p) => p.required).map((p) => p.name),
      };

      const { isNew, canonicalName } = registerSchema(
        registry,
        names.querySchemaName,
        querySchema,
      );
      schemaNameToCanonical.set(names.querySchemaName, canonicalName);

      if (isNew && !generatedNames.has(names.querySchemaName)) {
        generatedNames.add(names.querySchemaName);
        const properties: string[] = [];
        for (const param of queryParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
        }
        declarations.push(
          `export const ${names.querySchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      } else if (!isNew && names.querySchemaName !== canonicalName) {
        if (!generatedNames.has(names.querySchemaName)) {
          generatedNames.add(names.querySchemaName);
          declarations.push(
            `export const ${names.querySchemaName} = ${canonicalName};`,
          );
        }
      }
    }

    // Generate headers schema with deduplication
    if (names.headersSchemaName && headerParams.length > 0) {
      const headersSchema: AnySchema = {
        type: "object",
        properties: Object.fromEntries(
          headerParams.map((p) => [p.name, p.schema]),
        ),
        required: headerParams.filter((p) => p.required).map((p) => p.name),
      };

      const { isNew, canonicalName } = registerSchema(
        registry,
        names.headersSchemaName,
        headersSchema,
      );
      schemaNameToCanonical.set(names.headersSchemaName, canonicalName);

      if (isNew && !generatedNames.has(names.headersSchemaName)) {
        generatedNames.add(names.headersSchemaName);
        const properties: string[] = [];
        for (const param of headerParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
        }
        declarations.push(
          `export const ${names.headersSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      } else if (!isNew && names.headersSchemaName !== canonicalName) {
        if (!generatedNames.has(names.headersSchemaName)) {
          generatedNames.add(names.headersSchemaName);
          declarations.push(
            `export const ${names.headersSchemaName} = ${canonicalName};`,
          );
        }
      }
    }

    // Generate body schema with deduplication
    if (names.bodySchemaName && route.requestBody) {
      const { isNew, canonicalName } = registerSchema(
        registry,
        names.bodySchemaName,
        route.requestBody,
      );
      schemaNameToCanonical.set(names.bodySchemaName, canonicalName);

      if (isNew && !generatedNames.has(names.bodySchemaName)) {
        generatedNames.add(names.bodySchemaName);
        const zodExpr = convertSchema(route.requestBody);
        declarations.push(`export const ${names.bodySchemaName} = ${zodExpr};`);
      } else if (!isNew && names.bodySchemaName !== canonicalName) {
        if (!generatedNames.has(names.bodySchemaName)) {
          generatedNames.add(names.bodySchemaName);
          declarations.push(
            `export const ${names.bodySchemaName} = ${canonicalName};`,
          );
        }
      }
    }

    // Generate schemas for ALL status codes with deduplication
    for (const [statusCode, responseSchema] of Object.entries(
      route.responses,
    )) {
      if (!responseSchema) continue;

      const isSuccess = statusCode.startsWith("2");
      const suffix = isSuccess
        ? `${statusCode}Response`
        : `${statusCode}ErrorResponse`;
      const responseSchemaName = generateRouteSchemaName(
        route.path,
        route.method,
        suffix,
      );

      const { isNew, canonicalName } = registerSchema(
        registry,
        responseSchemaName,
        responseSchema,
      );
      schemaNameToCanonical.set(responseSchemaName, canonicalName);

      if (isNew && !generatedNames.has(responseSchemaName)) {
        generatedNames.add(responseSchemaName);
        const zodExpr = convertSchema(responseSchema);
        declarations.push(`export const ${responseSchemaName} = ${zodExpr};`);
      } else if (!isNew && responseSchemaName !== canonicalName) {
        if (!generatedNames.has(responseSchemaName)) {
          generatedNames.add(responseSchemaName);
          declarations.push(
            `export const ${responseSchemaName} = ${canonicalName};`,
          );
        }
      }
    }
  }

  return { declarations, schemaNameToCanonical };
}

function generateRequestResponseObjects(
  routes: RouteInfo[],
  schemaNameToCanonical: Map<string, string>,
): string[] {
  const lines: string[] = [];
  const requestPaths: Record<string, Record<string, string[]>> = {};
  const responsePaths: Record<
    string,
    Record<string, Record<string, string>>
  > = {};

  /**
   * Resolves a schema name to its canonical name if it exists,
   * otherwise returns the original name.
   */
  const resolveSchemaName = (name: string): string => {
    return schemaNameToCanonical.get(name) ?? name;
  };

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    if (!requestPaths[route.path]) {
      requestPaths[route.path] = {};
    }
    const requestMethodObj = requestPaths[route.path]!;
    if (!requestMethodObj[route.method]) {
      requestMethodObj[route.method] = [];
    }

    const requestParts: string[] = [];
    if (names.paramsSchemaName && pathParams.length > 0) {
      requestParts.push(
        `params: ${resolveSchemaName(names.paramsSchemaName)}`,
      );
    }
    if (names.querySchemaName && queryParams.length > 0) {
      requestParts.push(`query: ${resolveSchemaName(names.querySchemaName)}`);
    }
    if (names.headersSchemaName && headerParams.length > 0) {
      requestParts.push(
        `headers: ${resolveSchemaName(names.headersSchemaName)}`,
      );
    }
    if (names.bodySchemaName && route.requestBody) {
      requestParts.push(`body: ${resolveSchemaName(names.bodySchemaName)}`);
    }

    if (requestParts.length > 0) {
      requestMethodObj[route.method] = requestParts;
    }

    // Store all status codes in nested structure
    if (!responsePaths[route.path]) {
      responsePaths[route.path] = {};
    }
    const responseMethodObj = responsePaths[route.path]!;
    if (!responseMethodObj[route.method]) {
      responseMethodObj[route.method] = {};
    }

    for (const [statusCode, responseSchema] of Object.entries(
      route.responses,
    )) {
      if (!responseSchema) continue;

      const isSuccess = statusCode.startsWith("2");
      const suffix = isSuccess
        ? `${statusCode}Response`
        : `${statusCode}ErrorResponse`;
      const responseSchemaName = generateRouteSchemaName(
        route.path,
        route.method,
        suffix,
      );
      // Use canonical name for the Response object
      responseMethodObj[route.method]![statusCode] =
        resolveSchemaName(responseSchemaName);
    }
  }

  lines.push("export const Request = {");
  for (const [path, methods] of Object.entries(requestPaths)) {
    const methodEntries = Object.entries(methods).filter(
      ([, parts]) => parts.length > 0,
    );
    if (methodEntries.length > 0) {
      lines.push(`  '${path}': {`);
      for (const [method, parts] of methodEntries) {
        lines.push(`    ${method}: {`);
        for (const part of parts) {
          lines.push(`      ${part},`);
        }
        lines.push(`    },`);
      }
      lines.push(`  },`);
    }
  }
  lines.push("} as const;");
  lines.push("");

  lines.push("export const Response = {");
  for (const [path, methods] of Object.entries(responsePaths)) {
    const methodEntries = Object.entries(methods);
    if (methodEntries.length > 0) {
      lines.push(`  '${path}': {`);
      for (const [method, statusCodes] of methodEntries) {
        lines.push(`    ${method}: {`);
        for (const [statusCode, schemaName] of Object.entries(statusCodes)) {
          lines.push(`      '${statusCode}': ${schemaName},`);
        }
        lines.push(`    },`);
      }
      lines.push(`  },`);
    }
  }
  lines.push("} as const;");

  return lines;
}

/**
 * Collects all response schemas from routes for common schema detection.
 */
function collectRouteSchemas(
  routes: RouteInfo[],
): Array<{ name: string; schema: AnySchema }> {
  const collected: Array<{ name: string; schema: AnySchema }> = [];

  for (const route of routes) {
    for (const [statusCode, responseSchema] of Object.entries(
      route.responses,
    )) {
      if (!responseSchema) continue;

      const isSuccess = statusCode.startsWith("2");
      const suffix = isSuccess
        ? `${statusCode}Response`
        : `${statusCode}ErrorResponse`;
      const responseSchemaName = generateRouteSchemaName(
        route.path,
        route.method,
        suffix,
      );

      collected.push({ name: responseSchemaName, schema: responseSchema });
    }
  }

  return collected;
}

export const openApiToZodTsCode = (
  openapi: Record<string, unknown>,
  customImportLines?: string[],
  options?: { includeRoutes?: boolean },
): string => {
  const components = (openapi as AnySchema)["components"] as
    | AnySchema
    | undefined;
  const schemas: Record<string, AnySchema> =
    (components?.["schemas"] as Record<string, AnySchema>) ?? {};

  const lines: string[] = [];
  lines.push("/**");
  lines.push(" * This file was automatically generated from OpenAPI schema");
  lines.push(" * Do not manually edit this file");
  lines.push(" */");
  lines.push("");
  lines.push("import { z } from 'zod';");
  lines.push(...(customImportLines ?? []));
  lines.push("");

  // Type assertion helper for compile-time verification
  lines.push("// Type assertion helper - verifies interface matches schema at compile time");
  lines.push("type _AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;");
  lines.push("");

  // Create registry for schema deduplication
  const registry = createSchemaRegistry();

  const sortedSchemaNames = topologicalSortSchemas(schemas);

  // Collect all type assertions to emit after all schemas
  const typeAssertions: string[] = [];
  const outputSchemaNames = new Set<string>();
  const inputSchemaNames = new Set<string>();
  const schemaBlocks: string[] = [];

  for (const name of sortedSchemaNames) {
    const schema = schemas[name];
    if (schema) {
      const zodExpr = convertSchemaToZodString(schema);
      const schemaName = `${name}Schema`;
      const typeName = name;

      // Generate interface (concrete type in .d.ts)
      schemaBlocks.push(generateInterface(typeName, schema, { outputSchemaNames }));

      // Generate schema with ZodType<T> annotation (simple type in .d.ts)
      schemaBlocks.push(`export const ${schemaName}: z.ZodType<${typeName}> = ${zodExpr};`);
      schemaBlocks.push("");

      // Add type assertion to verify interface matches schema
      typeAssertions.push(`type _Assert${typeName} = _AssertEqual<${typeName}, z.infer<typeof ${schemaName}>>;`);

      // Register component schemas so they can be referenced by route schemas
      const fingerprint = getSchemaFingerprint(schema);
      preRegisterSchema(registry, schemaName, fingerprint);
    }
  }

  // Pre-process routes to collect input schema names for alias generation
  let routesForGeneration: RouteInfo[] = [];
  if (options?.includeRoutes) {
    routesForGeneration = parseOpenApiPaths(openapi);
    // Collect input schema names by processing input schemas
    for (const route of routesForGeneration) {
      const pathParams = route.parameters.filter((p) => p.in === "path");
      const queryParams = route.parameters.filter((p) => p.in === "query");
      const headerParams = route.parameters.filter((p) => p.in === "header");

      // Process path params
      for (const param of pathParams) {
        schemaToInputTypeString(param.schema, { inputSchemaNames });
      }

      // Process query params
      for (const param of queryParams) {
        schemaToInputTypeString(param.schema, { inputSchemaNames });
      }

      // Process header params
      for (const param of headerParams) {
        schemaToInputTypeString(param.schema, { inputSchemaNames });
      }

      // Process request body
      if (route.requestBody) {
        schemaToInputTypeString(route.requestBody, { inputSchemaNames });
      }
    }
  }

  if (outputSchemaNames.size > 0) {
    lines.push("// Zod output aliases for registered schemas");
    for (const schemaName of outputSchemaNames) {
      const aliasName = schemaExportNameToOutputAlias(schemaName);
      lines.push(`type ${aliasName} = z.output<typeof ${schemaName}>;`);
    }
    lines.push("");
  }

  if (inputSchemaNames.size > 0) {
    lines.push("// Zod input aliases for registered schemas");
    for (const schemaName of inputSchemaNames) {
      const aliasName = schemaExportNameToInputAlias(schemaName);
      lines.push(`type ${aliasName} = z.input<typeof ${schemaName}>;`);
    }
    lines.push("");
  }

  lines.push(...schemaBlocks);

  // Emit all type assertions
  if (typeAssertions.length > 0) {
    lines.push("// Compile-time type assertions - ensure interfaces match schemas");
    lines.push(typeAssertions.join("\n"));
    lines.push("");
  }

  if (routesForGeneration.length > 0) {
    // Find common schemas that appear multiple times (for error responses, etc.)
    const routeSchemaList = collectRouteSchemas(routesForGeneration);
    const commonSchemas = findCommonSchemas(routeSchemaList, 2);

    // Generate common schemas first (e.g., UnauthorizedErrorSchema, NotFoundErrorSchema)
    if (commonSchemas.length > 0) {
      lines.push("// Common Error Schemas (deduplicated)");
      for (const common of commonSchemas) {
        const zodExpr = convertSchemaToZodString(common.schema);
        lines.push(`export const ${common.name} = ${zodExpr};`);
        // Pre-register so route schemas reference this instead of duplicating
        preRegisterSchema(registry, common.name, common.fingerprint);
      }
      lines.push("");
    }

    // Generate route schemas with deduplication
    const { declarations, schemaNameToCanonical } = generateRouteSchemas(
      routesForGeneration,
      convertSchemaToZodString,
      registry,
    );

    if (declarations.length > 0) {
      lines.push("// Route Schemas");
      lines.push(...declarations);
      lines.push("");

      // Generate Request/Response objects using canonical names
      const requestResponseObjs = generateRequestResponseObjects(
        routesForGeneration,
        schemaNameToCanonical,
      );
      lines.push(...requestResponseObjs);
    }
  }

  return lines.join("\n");
};
