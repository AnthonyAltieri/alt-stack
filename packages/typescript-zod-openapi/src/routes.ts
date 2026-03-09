import type { AnySchema } from "./types/types";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface RouteParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: AnySchema;
}

export interface RouteInfo {
  path: string;
  method: HttpMethod;
  parameters: RouteParameter[];
  requestBody?: AnySchema;
  responses: Record<string, AnySchema>;
}

export interface RouteSchemaNames {
  paramsSchemaName?: string;
  querySchemaName?: string;
  headersSchemaName?: string;
  bodySchemaName?: string;
  responseSchemaName?: string;
}

function toUpperCaseMethod(method: string): HttpMethod {
  const upper = method.toUpperCase();
  if (
    upper === "GET" ||
    upper === "POST" ||
    upper === "PUT" ||
    upper === "PATCH" ||
    upper === "DELETE" ||
    upper === "HEAD" ||
    upper === "OPTIONS"
  ) {
    return upper as HttpMethod;
  }
  return "GET";
}

function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
}

function generateRouteSchemaName(
  path: string,
  method: HttpMethod,
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
    .map(toPascalCase);
  const methodPrefix = method.charAt(0) + method.slice(1).toLowerCase();
  const parts = [methodPrefix, ...pathParts, suffix];
  return parts.join("");
}

export function parseOpenApiPaths(
  openapi: Record<string, unknown>,
): RouteInfo[] {
  const paths = (openapi as AnySchema)["paths"] as
    | Record<string, AnySchema>
    | undefined;
  if (!paths) {
    return [];
  }

  const routes: RouteInfo[] = [];

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;

    const methods = [
      "get",
      "post",
      "put",
      "patch",
      "delete",
      "head",
      "options",
    ] as const;

    for (const method of methods) {
      const operation = pathItem[method] as AnySchema | undefined;
      if (!operation) continue;

      const parameters: RouteParameter[] = [];
      const responses: Record<string, AnySchema> = {};

      if (Array.isArray(pathItem["parameters"])) {
        for (const param of pathItem["parameters"]) {
          if (param && typeof param === "object") {
            parameters.push({
              name: String(param["name"] || ""),
              in: param["in"] || "query",
              required: Boolean(param["required"]),
              schema: param["schema"] || {},
            });
          }
        }
      }

      if (Array.isArray(operation["parameters"])) {
        for (const param of operation["parameters"]) {
          if (param && typeof param === "object") {
            parameters.push({
              name: String(param["name"] || ""),
              in: param["in"] || "query",
              required: Boolean(param["required"]),
              schema: param["schema"] || {},
            });
          }
        }
      }

      let requestBody: AnySchema | undefined;
      if (operation["requestBody"]) {
        const rb = operation["requestBody"];
        if (rb && typeof rb === "object") {
          const content = rb["content"];
          if (content && typeof content === "object") {
            const jsonContent = content["application/json"];
            if (jsonContent && typeof jsonContent === "object") {
              requestBody = jsonContent["schema"] || {};
            }
          }
        }
      }

      if (operation["responses"] && typeof operation["responses"] === "object") {
        for (const [statusCode, response] of Object.entries(
          operation["responses"],
        )) {
          if (response && typeof response === "object") {
            const responseSchema = response as AnySchema;
            const content = responseSchema["content"];
            if (content && typeof content === "object") {
              const jsonContent = content["application/json"];
              if (jsonContent && typeof jsonContent === "object") {
                const schema = jsonContent["schema"];
                if (schema) {
                  responses[statusCode] = schema;
                }
              }
            }
          }
        }
      }

      routes.push({
        path,
        method: toUpperCaseMethod(method),
        parameters,
        requestBody,
        responses,
      });
    }
  }

  return routes;
}

export function generateRouteSchemaNames(
  route: RouteInfo,
): RouteSchemaNames {
  const pathParams = route.parameters.filter((p) => p.in === "path");
  const queryParams = route.parameters.filter((p) => p.in === "query");
  const headerParams = route.parameters.filter((p) => p.in === "header");
  const successStatuses = Object.keys(route.responses).filter((s) =>
    s.startsWith("2"),
  );

  const result: RouteSchemaNames = {
    responseSchemaName: successStatuses.length > 0
      ? generateRouteSchemaName(
          route.path,
          route.method,
          "Response",
        )
      : undefined,
  };

  if (pathParams.length > 0) {
    result.paramsSchemaName = generateRouteSchemaName(
      route.path,
      route.method,
      "Params",
    );
  }

  if (queryParams.length > 0) {
    result.querySchemaName = generateRouteSchemaName(
      route.path,
      route.method,
      "Query",
    );
  }

  if (headerParams.length > 0) {
    result.headersSchemaName = generateRouteSchemaName(
      route.path,
      route.method,
      "Headers",
    );
  }

  if (route.requestBody) {
    result.bodySchemaName = generateRouteSchemaName(
      route.path,
      route.method,
      "Body",
    );
  }

  return result;
}

