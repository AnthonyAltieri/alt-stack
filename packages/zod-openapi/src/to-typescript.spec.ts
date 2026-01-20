import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { openApiToZodTsCode } from "./to-typescript";
import {
  registerZodSchemaToOpenApiSchema,
  clearZodSchemaToOpenApiSchemaRegistry,
} from "./registry";

describe("openApiToZodTsCode with routes", () => {
  beforeEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  afterEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  describe("route generation", () => {
    it("should generate Request and Response objects for paths", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
              required: ["id", "name"],
            },
          },
        },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const GetUsersIdParams");
      expect(result).toContain("export const GetUsersId200Response");
      expect(result).toContain("export const Request = {");
      expect(result).toContain("export const Response = {");
      expect(result).toContain("'/users/{id}':");
      expect(result).toContain("GET:");
      expect(result).toContain("params: GetUsersIdParams");
      expect(result).toContain("'200': GetUsersId200Response");
    });

    it("should use output alias for registered schemas in routes", () => {
      const uuidSchema = z.string().uuid();
      registerZodSchemaToOpenApiSchema(uuidSchema, {
        schemaExportedVariableName: "uuidSchema",
        type: "string",
        format: "uuid",
      });

      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(
        openapi,
        ['import { uuidSchema } from "./custom-schemas";'],
        { includeRoutes: true },
      );

      expect(result).toContain(
        "type UuidSchemaOutput = z.output<typeof uuidSchema>;",
      );
      expect(result).toContain("id: UuidSchemaOutput;");
      expect(result).toContain("export const GetUsersId200Response = UserSchema;");
      expect(result).toContain("'200': GetUsersId200Response");
    });

    it("should generate Request with body schema", () => {
      const openapi = {
        components: {
          schemas: {
            CreateUser: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
              required: ["id", "name"],
            },
          },
        },
        paths: {
          "/users": {
            post: {
              requestBody: {
                content: {
                  "application/json": {
                    schema: {
                      $ref: "#/components/schemas/CreateUser",
                    },
                  },
                },
              },
              responses: {
                "201": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const PostUsersBody");
      expect(result).toContain("export const PostUsers201Response");
      expect(result).toContain("body: PostUsersBody");
    });

    it("should generate Request with query parameters", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "limit",
                  in: "query",
                  required: false,
                  schema: { type: "number" },
                },
                {
                  name: "offset",
                  in: "query",
                  required: false,
                  schema: { type: "number" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const GetUsersQuery");
      expect(result).toContain("query: GetUsersQuery");
      expect(result).toContain("limit: z.number().optional()");
      expect(result).toContain("offset: z.number().optional()");
    });

    it("should generate Request with headers", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users": {
            get: {
              parameters: [
                {
                  name: "Authorization",
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const GetUsersHeaders");
      expect(result).toContain("headers: GetUsersHeaders");
    });

    it("should handle multiple 2xx responses as union", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
            Error: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        },
        paths: {
          "/users": {
            post: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
                "201": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const PostUsers200Response");
      expect(result).toContain("export const PostUsers201Response");
    });

    it("should not generate routes when includeRoutes is false", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: false,
      });

      expect(result).not.toContain("export const Request");
      expect(result).not.toContain("export const Response");
    });

    it("should handle paths without routes", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).not.toContain("export const Request");
      expect(result).not.toContain("export const Response");
    });

    it("should handle routes without requestBody", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("export const Response");
      expect(result).toContain("'200': GetUsers200Response");
    });

    it("should quote hyphenated parameter names", () => {
      const openapi = {
        components: { schemas: {} },
        paths: {
          "/foo-bar/{user-id}": {
            get: {
              parameters: [
                {
                  name: "user-id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
                {
                  name: "page-size",
                  in: "query",
                  required: false,
                  schema: { type: "number" },
                },
                {
                  name: "x-custom-header",
                  in: "header",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: {} },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("'user-id': z.string()");
      expect(result).toContain("'page-size': z.number().optional()");
      expect(result).toContain("'x-custom-header': z.string()");
      expect(result).toContain("GetFooBarUserIdParams");
      expect(result).toContain("GetFooBarUserIdQuery");
      expect(result).toContain("GetFooBarUserIdHeaders");
    });

    it("should handle multiple methods on same path", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
              required: ["id"],
            },
          },
        },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        $ref: "#/components/schemas/User",
                      },
                    },
                  },
                },
              },
            },
            delete: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "204": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {},
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      expect(result).toContain("GET:");
      expect(result).toContain("DELETE:");
      expect(result).toContain("'/users/{id}':");
    });
  });

  describe("schema deduplication", () => {
    it("should deduplicate identical error responses across endpoints", () => {
      const unauthorizedError = {
        type: "object",
        properties: {
          error: {
            type: "object",
            properties: {
              code: { type: "string", enum: ["UNAUTHORIZED"] },
              message: { type: "string" },
            },
            required: ["code", "message"],
          },
        },
        required: ["error"],
      };

      const openapi = {
        components: { schemas: {} },
        paths: {
          "/users": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: {} },
                    },
                  },
                },
                "401": {
                  content: {
                    "application/json": { schema: unauthorizedError },
                  },
                },
              },
            },
            post: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: {} },
                    },
                  },
                },
                "401": {
                  content: {
                    "application/json": { schema: unauthorizedError },
                  },
                },
              },
            },
          },
          "/items": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: { type: "object", properties: {} },
                    },
                  },
                },
                "401": {
                  content: {
                    "application/json": { schema: unauthorizedError },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      // Should generate a common error schema
      expect(result).toContain("// Common Error Schemas (deduplicated)");
      expect(result).toContain("UnauthorizedErrorSchema");

      // Route-specific schemas should reference the common schema
      expect(result).toContain(
        "export const GetUsers401ErrorResponse = UnauthorizedErrorSchema;",
      );
      expect(result).toContain(
        "export const PostUsers401ErrorResponse = UnauthorizedErrorSchema;",
      );
      expect(result).toContain(
        "export const GetItems401ErrorResponse = UnauthorizedErrorSchema;",
      );

      // Response object should reference the canonical schema
      expect(result).toContain("'401': UnauthorizedErrorSchema");
    });

    it("should deduplicate identical success responses across endpoints", () => {
      const userSchema = {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      };

      const openapi = {
        components: { schemas: {} },
        paths: {
          "/users/{id}": {
            get: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: userSchema },
                  },
                },
              },
            },
            put: {
              parameters: [
                {
                  name: "id",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
              responses: {
                "200": {
                  content: {
                    "application/json": { schema: userSchema },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      // The first occurrence becomes the canonical schema
      expect(result).toContain("export const GetUsersId200Response =");

      // The second should be an alias to the first
      expect(result).toContain(
        "export const PutUsersId200Response = GetUsersId200Response;",
      );
    });

    it("should not deduplicate different schemas", () => {
      const openapi = {
        components: { schemas: {} },
        paths: {
          "/users": {
            get: {
              responses: {
                "200": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: { users: { type: "array" } },
                      },
                    },
                  },
                },
                "401": {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          error: {
                            type: "object",
                            properties: {
                              code: { type: "string", enum: ["UNAUTHORIZED"] },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi, undefined, {
        includeRoutes: true,
      });

      // Both should be separate schemas since they're different
      expect(result).toContain("export const GetUsers200Response =");
      expect(result).toContain("export const GetUsers401ErrorResponse =");

      // They should not reference each other
      expect(result).not.toContain(
        "GetUsers401ErrorResponse = GetUsers200Response",
      );
    });
  });
});

