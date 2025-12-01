import { topologicalSortSchemas } from "./dependencies";
import { convertSchemaToZodString } from "./to-zod";
import type { AnySchema } from "./types/types";
import {
  parseOpenApiPaths,
  generateRouteSchemaNames,
  type RouteInfo,
} from "./routes";

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

function generateRouteSchemas(
  routes: RouteInfo[],
  convertSchema: (schema: AnySchema) => string,
): string[] {
  const lines: string[] = [];
  const schemaNames = new Set<string>();

  for (const route of routes) {
    const names = generateRouteSchemaNames(route);
    const pathParams = route.parameters.filter((p) => p.in === "path");
    const queryParams = route.parameters.filter((p) => p.in === "query");
    const headerParams = route.parameters.filter((p) => p.in === "header");

    if (names.paramsSchemaName && pathParams.length > 0) {
      if (!schemaNames.has(names.paramsSchemaName)) {
        schemaNames.add(names.paramsSchemaName);
        const properties: string[] = [];
        const required: string[] = [];
        for (const param of pathParams) {
          const zodExpr = convertSchema(param.schema);
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
          if (param.required) {
            required.push(param.name);
          }
        }
        lines.push(
          `export const ${names.paramsSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.querySchemaName && queryParams.length > 0) {
      if (!schemaNames.has(names.querySchemaName)) {
        schemaNames.add(names.querySchemaName);
        const properties: string[] = [];
        for (const param of queryParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
        }
        lines.push(
          `export const ${names.querySchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.headersSchemaName && headerParams.length > 0) {
      if (!schemaNames.has(names.headersSchemaName)) {
        schemaNames.add(names.headersSchemaName);
        const properties: string[] = [];
        for (const param of headerParams) {
          let zodExpr = convertSchema(param.schema);
          if (!param.required) {
            zodExpr += ".optional()";
          }
          properties.push(`${quotePropertyName(param.name)}: ${zodExpr}`);
        }
        lines.push(
          `export const ${names.headersSchemaName} = z.object({ ${properties.join(", ")} });`,
        );
      }
    }

    if (names.bodySchemaName && route.requestBody) {
      if (!schemaNames.has(names.bodySchemaName)) {
        schemaNames.add(names.bodySchemaName);
        const zodExpr = convertSchema(route.requestBody);
        lines.push(`export const ${names.bodySchemaName} = ${zodExpr};`);
      }
    }

    // Generate schemas for ALL status codes, not just success
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

      if (!schemaNames.has(responseSchemaName)) {
        schemaNames.add(responseSchemaName);
        const zodExpr = convertSchema(responseSchema);
        lines.push(`export const ${responseSchemaName} = ${zodExpr};`);
      }
    }
  }

  return lines;
}

function generateRequestResponseObjects(routes: RouteInfo[]): string[] {
  const lines: string[] = [];
  const requestPaths: Record<string, Record<string, string[]>> = {};
  const responsePaths: Record<
    string,
    Record<string, Record<string, string>>
  > = {};

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
      requestParts.push(`params: ${names.paramsSchemaName}`);
    }
    if (names.querySchemaName && queryParams.length > 0) {
      requestParts.push(`query: ${names.querySchemaName}`);
    }
    if (names.headersSchemaName && headerParams.length > 0) {
      requestParts.push(`headers: ${names.headersSchemaName}`);
    }
    if (names.bodySchemaName && route.requestBody) {
      requestParts.push(`body: ${names.bodySchemaName}`);
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
      responseMethodObj[route.method]![statusCode] = responseSchemaName;
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

  const sortedSchemaNames = topologicalSortSchemas(schemas);

  for (const name of sortedSchemaNames) {
    const schema = schemas[name];
    if (schema) {
      const zodExpr = convertSchemaToZodString(schema);
      const schemaName = `${name}Schema`;
      const typeName = name;
      lines.push(`export const ${schemaName} = ${zodExpr};`);
      lines.push(`export type ${typeName} = z.infer<typeof ${schemaName}>;`);
      lines.push("");
    }
  }

  if (options?.includeRoutes) {
    const routes = parseOpenApiPaths(openapi);
    if (routes.length > 0) {
      const routeSchemas = generateRouteSchemas(
        routes,
        convertSchemaToZodString,
      );
      if (routeSchemas.length > 0) {
        lines.push(...routeSchemas);
        lines.push("");
        const requestResponseObjs = generateRequestResponseObjects(routes);
        lines.push(...requestResponseObjs);
      }
    }
  }

  return lines.join("\n");
};
