import { z } from "zod";
import type { Router } from "./router.js";
import type { Procedure } from "./types/procedure.js";
import type { InputConfig } from "./types/index.js";

// ============================================================================
// Types
// ============================================================================

export interface OpenAPISpec {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  paths: Record<string, OpenAPIPathItem>;
  components?: {
    schemas: Record<string, Record<string, unknown>>;
  };
}

export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  parameters?: OpenAPIParameter[];
}

export interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
}

export interface OpenAPIParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  description?: string;
  schema: Record<string, unknown>;
}

export interface OpenAPIRequestBody {
  required?: boolean;
  content: {
    "application/json": {
      schema: Record<string, unknown> | { $ref: string };
    };
  };
}

export interface OpenAPIResponse {
  description: string;
  content?: {
    "application/json": {
      schema: Record<string, unknown> | { $ref: string };
    };
  };
}

export interface GenerateOpenAPISpecOptions {
  title?: string;
  version?: string;
  description?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizePrefix(prefix: string): string {
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizePath(prefix: string, path: string): string {
  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanPath =
    normalizedPath.endsWith("/") && normalizedPath !== "/"
      ? normalizedPath.slice(0, -1)
      : normalizedPath;
  return `${normalizedPrefix}${cleanPath}`;
}

function convertPathToOpenAPI(path: string): string {
  // Convert Hono-style path params (:param) to OpenAPI style ({param})
  // Also handles already OpenAPI-style paths
  let converted = path.replace(/:([^/]+)/g, "{$1}");
  // Remove trailing slash unless it's the root path "/"
  if (converted.endsWith("/") && converted !== "/") {
    converted = converted.slice(0, -1);
  }
  return converted;
}

function extractPathParams(path: string): string[] {
  const params: string[] = [];
  const matches = path.matchAll(/\{([^}]+)\}/g);
  for (const match of matches) {
    params.push(match[1]!);
  }
  return params;
}

function generateOperationId(method: string, path: string): string {
  const pathParts = path
    .split("/")
    .filter((p) => p)
    .map((p) => {
      if (p.startsWith("{") && p.endsWith("}")) {
        return p.slice(1, -1);
      }
      return p;
    })
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1));
  const methodLower = method.toLowerCase();
  return `${methodLower}${pathParts.join("")}`;
}

// ============================================================================
// Schema Conversion
// ============================================================================

function zodToJSONSchema(
  schema: z.ZodTypeAny,
  options?: { io?: "input" | "output" },
): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, {
      target: "openapi-3.0",
      io: options?.io,
    }) as Record<string, unknown>;
  } catch (error) {
    // If schema conversion fails, return a basic schema
    console.warn("Failed to convert Zod schema to JSON Schema:", error);
    return { type: "object" };
  }
}

// ============================================================================
// Parameter Conversion
// ============================================================================

function convertParamsToOpenAPIParameters(
  pathParams: string[],
  paramsSchema: z.ZodTypeAny | undefined,
): OpenAPIParameter[] {
  const parameters: OpenAPIParameter[] = [];

  // Extract path parameters from the route path
  if (pathParams.length > 0) {
    const paramsObject =
      paramsSchema &&
      "shape" in paramsSchema &&
      typeof paramsSchema.shape === "object"
        ? (paramsSchema.shape as Record<string, z.ZodTypeAny>)
        : {};

    for (const paramName of pathParams) {
      const paramSchema = paramsObject[paramName] as z.ZodTypeAny | undefined;
      const jsonSchema = paramSchema
        ? zodToJSONSchema(paramSchema, { io: "input" })
        : { type: "string" };

      parameters.push({
        name: paramName,
        in: "path",
        required: true, // Path parameters are always required
        schema: jsonSchema,
      });
    }
  }

  return parameters;
}

function convertQueryToOpenAPIParameters(
  querySchema: z.ZodTypeAny | undefined,
): OpenAPIParameter[] {
  if (!querySchema) {
    return [];
  }

  const jsonSchema = zodToJSONSchema(querySchema, { io: "input" });
  const parameters: OpenAPIParameter[] = [];

  // If it's an object schema, extract individual properties
  if (
    jsonSchema.type === "object" &&
    jsonSchema.properties &&
    typeof jsonSchema.properties === "object"
  ) {
    const properties = jsonSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const required = (jsonSchema.required as string[]) || [];

    for (const [name, schema] of Object.entries(properties)) {
      parameters.push({
        name,
        in: "query",
        required: required.includes(name),
        schema: schema,
      });
    }
  } else {
    // If it's not an object, treat the whole query schema as a single parameter
    // This is less common but handle it gracefully
    parameters.push({
      name: "query",
      in: "query",
      required: false,
      schema: jsonSchema,
    });
  }

  return parameters;
}

// ============================================================================
// Schema Registry
// ============================================================================

class SchemaRegistry {
  private schemas: Map<string, Record<string, unknown>> = new Map();
  private schemaHashes: Map<string, string> = new Map();

  private generateSchemaName(
    operationId: string,
    suffix: "Response" | "Body" | string,
  ): string {
    const capitalized =
      operationId.charAt(0).toUpperCase() + operationId.slice(1);
    return `${capitalized}${suffix}`;
  }

  private hashSchema(schema: Record<string, unknown>): string {
    // Simple hash based on stringified schema for deduplication
    return JSON.stringify(schema);
  }

  registerSchema(
    operationId: string,
    suffix: "Response" | "Body" | string,
    schema: Record<string, unknown>,
  ): { $ref: string } {
    const hash = this.hashSchema(schema);
    const existingName = this.schemaHashes.get(hash);

    if (existingName) {
      return { $ref: `#/components/schemas/${existingName}` };
    }

    const name = this.generateSchemaName(operationId, suffix);
    // Handle name conflicts by appending numbers
    let finalName = name;
    let counter = 1;
    while (this.schemas.has(finalName)) {
      finalName = `${name}${counter}`;
      counter++;
    }

    this.schemas.set(finalName, schema);
    this.schemaHashes.set(hash, finalName);
    return { $ref: `#/components/schemas/${finalName}` };
  }

  getSchemas(): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const [name, schema] of this.schemas.entries()) {
      result[name] = schema;
    }
    return result;
  }
}

// ============================================================================
// Request Body Conversion
// ============================================================================

function convertBodyToOpenAPIRequestBody(
  bodySchema: z.ZodTypeAny | undefined,
  operationId: string,
  schemaRegistry: SchemaRegistry,
): OpenAPIRequestBody | undefined {
  if (!bodySchema) {
    return undefined;
  }

  const jsonSchema = zodToJSONSchema(bodySchema, { io: "input" });
  const schemaRef = schemaRegistry.registerSchema(
    operationId,
    "Body",
    jsonSchema,
  );

  return {
    required: true,
    content: {
      "application/json": {
        schema: schemaRef,
      },
    },
  };
}

// ============================================================================
// Response Conversion
// ============================================================================

function convertOutputToOpenAPIResponse(
  outputSchema: z.ZodTypeAny | undefined,
  operationId: string,
  schemaRegistry: SchemaRegistry,
): Record<string, OpenAPIResponse> {
  const responses: Record<string, OpenAPIResponse> = {};

  if (outputSchema) {
    const jsonSchema = zodToJSONSchema(outputSchema, { io: "output" });
    const schemaRef = schemaRegistry.registerSchema(
      operationId,
      "Response",
      jsonSchema,
    );
    responses["200"] = {
      description: "Successful response",
      content: {
        "application/json": {
          schema: schemaRef,
        },
      },
    };
  } else {
    responses["200"] = {
      description: "Successful response",
    };
  }

  return responses;
}

function convertErrorsToOpenAPIResponses(
  errors: Record<number, z.ZodTypeAny> | undefined,
  operationId: string,
  schemaRegistry: SchemaRegistry,
): Record<string, OpenAPIResponse> {
  if (!errors) {
    return {};
  }

  const responses: Record<string, OpenAPIResponse> = {};

  for (const [statusCode, errorValue] of Object.entries(errors)) {
    // Handle new string-based error tags
    if (typeof errorValue === "string" || Array.isArray(errorValue)) {
      const tags = Array.isArray(errorValue) ? errorValue : [errorValue];
      // Generate a simple error schema for string tags
      const jsonSchema: Record<string, unknown> = {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: {
                type: "string",
                enum: tags,
              },
              message: {
                type: "string",
              },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      };
      const suffix = `${statusCode}Error`;
      const schemaRef = schemaRegistry.registerSchema(
        operationId,
        suffix,
        jsonSchema,
      );
      responses[statusCode] = {
        description: `Error response`,
        content: {
          "application/json": {
            schema: schemaRef,
          },
        },
      };
    } else {
      // Handle Zod schema errors (legacy support)
      const jsonSchema = zodToJSONSchema(errorValue, { io: "output" });
      const suffix = `${statusCode}Error`;
      const schemaRef = schemaRegistry.registerSchema(
        operationId,
        suffix,
        jsonSchema,
      );
      responses[statusCode] = {
        description: `Error response`,
        content: {
          "application/json": {
            schema: schemaRef,
          },
        },
      };
    }
  }

  return responses;
}

// ============================================================================
// Operation Conversion
// ============================================================================

function convertProcedureToOpenAPIOperation<
  TCustomContext extends object = Record<string, never>,
>(
  procedure: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >,
  schemaRegistry: SchemaRegistry,
): OpenAPIOperation {
  const openAPIPath = convertPathToOpenAPI(procedure.path);
  const pathParams = extractPathParams(openAPIPath);
  const operationId = generateOperationId(procedure.method, openAPIPath);

  const parameters: OpenAPIParameter[] = [];

  // Add path parameters
  const pathParameters = convertParamsToOpenAPIParameters(
    pathParams,
    procedure.config.input.params,
  );
  parameters.push(...pathParameters);

  // Add query parameters
  const queryParameters = convertQueryToOpenAPIParameters(
    procedure.config.input.query,
  );
  parameters.push(...queryParameters);

  // Request body
  const requestBody = convertBodyToOpenAPIRequestBody(
    procedure.config.input.body,
    operationId,
    schemaRegistry,
  );

  // Responses
  const successResponses = convertOutputToOpenAPIResponse(
    procedure.config.output,
    operationId,
    schemaRegistry,
  );
  const errorResponses = convertErrorsToOpenAPIResponses(
    procedure.config.errors,
    operationId,
    schemaRegistry,
  );

  const operation: OpenAPIOperation = {
    operationId,
    responses: {
      ...successResponses,
      ...errorResponses,
    },
  };

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  if (requestBody) {
    operation.requestBody = requestBody;
  }

  return operation;
}

// ============================================================================
// Path Item Conversion
// ============================================================================

function convertProceduresToOpenAPIPaths<
  TCustomContext extends object = Record<string, never>,
>(
  procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[],
  schemaRegistry: SchemaRegistry,
): Record<string, OpenAPIPathItem> {
  const paths: Record<string, OpenAPIPathItem> = {};

  for (const procedure of procedures) {
    const openAPIPath = convertPathToOpenAPI(procedure.path);
    const operation = convertProcedureToOpenAPIOperation<TCustomContext>(
      procedure,
      schemaRegistry,
    );

    if (!paths[openAPIPath]) {
      paths[openAPIPath] = {};
    }

    const method = procedure.method.toLowerCase() as
      | "get"
      | "post"
      | "put"
      | "patch"
      | "delete";
    paths[openAPIPath]![method] = operation;
  }

  return paths;
}

// ============================================================================
// Main Generation Function
// ============================================================================

export function generateOpenAPISpec<
  TCustomContext extends object = Record<string, never>,
>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options: GenerateOpenAPISpecOptions = {},
): OpenAPISpec {
  // Collect all procedures from all routers
  const allProcedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  for (const [prefix, routerOrRouters] of Object.entries(config)) {
    const routers = Array.isArray(routerOrRouters)
      ? routerOrRouters
      : [routerOrRouters];

    for (const router of routers) {
      const routerProcedures = router.getProcedures();

      for (const procedure of routerProcedures) {
        allProcedures.push({
          ...procedure,
          path: normalizePath(prefix, procedure.path),
        });
      }
    }
  }

  const schemaRegistry = new SchemaRegistry();
  const paths = convertProceduresToOpenAPIPaths<TCustomContext>(allProcedures, schemaRegistry);
  const schemas = schemaRegistry.getSchemas();

  const spec: OpenAPISpec = {
    openapi: "3.0.0",
    info: {
      title: options.title || "API",
      version: options.version || "1.0.0",
      ...(options.description && { description: options.description }),
    },
    paths,
  };

  if (Object.keys(schemas).length > 0) {
    spec.components = {
      schemas,
    };
  }

  return spec;
}

