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
  type RouteParameter,
} from "./routes";
import { generateInterface, schemaExportNameToOutputAlias } from "./interface-generator";

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

  const registerAndDeclare = (
    schemaName: string,
    schema: AnySchema,
    zodExpression: string,
  ): void => {
    const { isNew, canonicalName } = registerSchema(
      registry,
      schemaName,
      schema,
    );
    schemaNameToCanonical.set(schemaName, canonicalName);

    if (isNew) {
      declarations.push(`export const ${schemaName} = ${zodExpression};`);
      return;
    }

    if (schemaName !== canonicalName) {
      declarations.push(`export const ${schemaName} = ${canonicalName};`);
    }
  };

  const buildOpenApiObjectSchema = (params: RouteParameter[]): AnySchema => {
    return {
      type: "object",
      properties: Object.fromEntries(params.map((p) => [p.name, p.schema])),
      required: params.filter((p) => p.required).map((p) => p.name),
    };
  };

  const buildZodObjectSchema = (
    params: RouteParameter[],
    options: { optionalizeNonRequired: boolean },
  ): string => {
    const properties: string[] = [];
    for (const param of params) {
      let zodExpr = convertSchema(param.schema);
      if (options.optionalizeNonRequired && !param.required) {
        zodExpr += ".optional()";
      }
      properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
    }
    return `z.object({ ${properties.join(", ")} })`;
  };

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    if (names.paramsSchemaName && pathParams.length > 0) {
      registerAndDeclare(
        names.paramsSchemaName,
        buildOpenApiObjectSchema(pathParams),
        buildZodObjectSchema(pathParams, { optionalizeNonRequired: false }),
      );
    }

    if (names.querySchemaName && queryParams.length > 0) {
      registerAndDeclare(
        names.querySchemaName,
        buildOpenApiObjectSchema(queryParams),
        buildZodObjectSchema(queryParams, { optionalizeNonRequired: true }),
      );
    }

    if (names.headersSchemaName && headerParams.length > 0) {
      registerAndDeclare(
        names.headersSchemaName,
        buildOpenApiObjectSchema(headerParams),
        buildZodObjectSchema(headerParams, { optionalizeNonRequired: true }),
      );
    }

    if (names.bodySchemaName && route.requestBody) {
      registerAndDeclare(
        names.bodySchemaName,
        route.requestBody,
        convertSchema(route.requestBody),
      );
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

      registerAndDeclare(
        responseSchemaName,
        responseSchema,
        convertSchema(responseSchema),
      );
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
      schemaBlocks.push(`export const ${schemaName} = ${zodExpr};`);
      schemaBlocks.push("");

      // Add type assertion to verify interface matches schema
      typeAssertions.push(`type _Assert${typeName} = _AssertEqual<${typeName}, z.infer<typeof ${schemaName}>>;`);

      // Register component schemas so they can be referenced by route schemas
      const fingerprint = getSchemaFingerprint(schema);
      preRegisterSchema(registry, schemaName, fingerprint);
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

  lines.push(...schemaBlocks);

  // Emit all type assertions
  if (typeAssertions.length > 0) {
    lines.push("// Compile-time type assertions - ensure interfaces match schemas");
    lines.push(typeAssertions.join("\n"));
    lines.push("");
  }

  if (options?.includeRoutes) {
    const routes = parseOpenApiPaths(openapi);
    if (routes.length > 0) {
      // Find common schemas that appear multiple times (for error responses, etc.)
      const routeSchemaList = collectRouteSchemas(routes);
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
        routes,
        convertSchemaToZodString,
        registry,
      );

      if (declarations.length > 0) {
        lines.push("// Route Schemas");
        lines.push(...declarations);
        lines.push("");

        // Generate Request/Response objects using canonical names
        const requestResponseObjs = generateRequestResponseObjects(
          routes,
          schemaNameToCanonical,
        );
        lines.push(...requestResponseObjs);
      }
    }
  }

  return lines.join("\n");
};
