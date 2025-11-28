import { describe, it, expect } from "vitest";
import {
  generateOpenAPISpec,
  createDocsRouter,
  createServer,
  router,
  Router,
} from "../src/index.js";
import { z } from "zod";

describe("generateOpenAPISpec", () => {
  it("should generate OpenAPI spec for a simple GET route", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(() => ({ id: "1", name: "Test" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.paths["/api/test"]).toBeDefined();
    expect(spec.paths["/api/test"]?.get).toBeDefined();
    expect(spec.paths["/api/test"]?.get?.operationId).toBe("getApiTest");
    expect(spec.paths["/api/test"]?.get?.responses["200"]).toBeDefined();
  });

  it("should generate OpenAPI spec with custom info", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure.output(z.string()).get(() => "test"),
    });

    const spec = generateOpenAPISpec(
      { api: testRouter },
      {
        title: "My API",
        version: "2.0.0",
        description: "Test API",
      },
    );

    expect(spec.info.title).toBe("My API");
    expect(spec.info.version).toBe("2.0.0");
    expect(spec.info.description).toBe("Test API");
  });

  it("should handle path parameters", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .get(({ input }) => ({ id: input.params.id, name: "Test" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation).toBeDefined();
    expect(operation?.parameters).toBeDefined();
    expect(operation?.parameters?.length).toBe(1);
    expect(operation?.parameters?.[0]?.name).toBe("id");
    expect(operation?.parameters?.[0]?.in).toBe("path");
    expect(operation?.parameters?.[0]?.required).toBe(true);
  });

  it("should handle query parameters", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/search": baseRouter.procedure
        .input({
          query: z.object({
            q: z.string(),
            limit: z.number().optional(),
          }),
        })
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/search"]?.get;
    expect(operation?.parameters).toBeDefined();
    const queryParams = operation?.parameters?.filter((p) => p.in === "query");
    expect(queryParams?.length).toBe(2);
    expect(queryParams?.find((p) => p.name === "q")?.required).toBe(true);
    expect(queryParams?.find((p) => p.name === "limit")?.required).toBe(false);
  });

  it("should handle request body for POST", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users": baseRouter.procedure
        .input({
          body: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
        })
        .output(z.object({ id: z.string(), name: z.string(), email: z.string() }))
        .post(() => ({ id: "1", name: "Test", email: "test@example.com" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users"]?.post;
    expect(operation?.requestBody).toBeDefined();
    expect(operation?.requestBody?.required).toBe(true);
    expect(operation?.requestBody?.content["application/json"]).toBeDefined();
  });

  it("should handle request body for PUT", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string().optional() }),
        })
        .output(z.object({ id: z.string() }))
        .put(() => ({ id: "1" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users/{id}"]?.put;
    expect(operation?.requestBody).toBeDefined();
  });

  it("should handle request body for PATCH", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({
          params: z.object({ id: z.string() }),
          body: z.object({ name: z.string().optional() }),
        })
        .output(z.object({ id: z.string() }))
        .patch(() => ({ id: "1" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users/{id}"]?.patch;
    expect(operation?.requestBody).toBeDefined();
  });

  it("should handle error responses", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .errors({
          404: z.object({
            error: z.object({
              code: z.literal("NOT_FOUND"),
              message: z.string(),
            }),
          }),
          500: z.object({
            error: z.object({
              code: z.literal("INTERNAL_ERROR"),
              message: z.string(),
            }),
          }),
        })
        .get(() => ({ id: "1" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation?.responses["200"]).toBeDefined();
    expect(operation?.responses["404"]).toBeDefined();
    expect(operation?.responses["500"]).toBeDefined();
  });

  it("should handle routes without output schema", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure.get(() => ({ data: "test" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/test"]?.get;
    expect(operation?.responses["200"]).toBeDefined();
    expect(operation?.responses["200"]?.content).toBeUndefined();
  });

  it("should handle routes without input schema", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure.output(z.string()).get(() => "test"),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/test"]?.get;
    expect(operation?.parameters).toBeUndefined();
  });

  it("should handle DELETE method", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ success: z.boolean() }))
        .delete(() => ({ success: true })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    expect(spec.paths["/api/users/{id}"]?.delete).toBeDefined();
    const operation = spec.paths["/api/users/{id}"]?.delete;
    expect(operation?.operationId).toBe("deleteApiUsersId");
  });

  it("should handle multiple routers with prefixes", () => {
    const baseRouter = new Router();
    const usersRouter = router({
      "/": baseRouter.procedure
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const postsRouter = router({
      "/": baseRouter.procedure
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const spec = generateOpenAPISpec({
      users: usersRouter,
      posts: postsRouter,
    });

    expect(spec.paths["/users"]).toBeDefined();
    expect(spec.paths["/posts"]).toBeDefined();
  });

  it("should handle multiple operations on same path", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/items/{id}": {
        get: baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .handler(() => ({ id: "1" })),
        patch: baseRouter.procedure
          .input({
            params: z.object({ id: z.string() }),
            body: z.object({ name: z.string().optional() }),
          })
          .output(z.object({ id: z.string() }))
          .handler(() => ({ id: "1" })),
        delete: baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ success: z.boolean() }))
          .handler(() => ({ success: true })),
      },
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const pathItem = spec.paths["/api/items/{id}"];
    expect(pathItem?.get).toBeDefined();
    expect(pathItem?.patch).toBeDefined();
    expect(pathItem?.delete).toBeDefined();
  });

  it("should handle array of routers", () => {
    const baseRouter = new Router();
    const router1 = router({
      "/route1": baseRouter.procedure.output(z.string()).get(() => "test"),
    });

    const router2 = router({
      "/route2": baseRouter.procedure.output(z.string()).get(() => "test"),
    });

    const spec = generateOpenAPISpec({
      api: [router1, router2],
    });

    expect(spec.paths["/api/route1"]).toBeDefined();
    expect(spec.paths["/api/route2"]).toBeDefined();
  });

  it("should handle complex nested object schemas", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users": baseRouter.procedure
        .input({
          body: z.object({
            name: z.string(),
            address: z.object({
              street: z.string(),
              city: z.string(),
              zip: z.string(),
            }),
            tags: z.array(z.string()),
          }),
        })
        .output(z.object({ id: z.string(), name: z.string() }))
        .post(() => ({ id: "1", name: "Test" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users"]?.post;
    expect(operation?.requestBody).toBeDefined();
    const schema = operation?.requestBody?.content["application/json"]?.schema;
    expect(schema).toBeDefined();
    // Schema should now be a $ref
    if ("$ref" in (schema || {})) {
      const ref = (schema as { $ref: string }).$ref;
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const schemaName = ref.split("/").pop();
      expect(spec.components?.schemas?.[schemaName || ""]).toBeDefined();
    }
  });

  it("should generate named schemas in components with $ref references", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string(), name: z.string() }))
        .errors({
          404: z.object({
            error: z.object({
              code: z.literal("NOT_FOUND"),
              message: z.string(),
            }),
          }),
        })
        .get(() => ({ id: "1", name: "Test" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    // Check that components.schemas exists
    expect(spec.components).toBeDefined();
    expect(spec.components?.schemas).toBeDefined();

    // Check response schema
    const operation = spec.paths["/api/users/{id}"]?.get;
    const responseSchema =
      operation?.responses["200"]?.content?.["application/json"]?.schema;
    expect(responseSchema).toBeDefined();
    if (responseSchema && "$ref" in responseSchema) {
      const ref = (responseSchema as { $ref: string }).$ref;
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const schemaName = ref.split("/").pop();
      expect(schemaName).toMatch(/Response$/);
      expect(spec.components?.schemas?.[schemaName || ""]).toBeDefined();
    }

    // Check error response schema
    const errorResponseSchema =
      operation?.responses["404"]?.content?.["application/json"]?.schema;
    expect(errorResponseSchema).toBeDefined();
    if (errorResponseSchema && "$ref" in errorResponseSchema) {
      const ref = (errorResponseSchema as { $ref: string }).$ref;
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const schemaName = ref.split("/").pop();
      expect(schemaName).toMatch(/404Error$/);
      expect(spec.components?.schemas?.[schemaName || ""]).toBeDefined();
    }
  });

  it("should handle optional parameters correctly", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/search": baseRouter.procedure
        .input({
          query: z.object({
            required: z.string(),
            optional: z.string().optional(),
            nullable: z.string().nullable(),
          }),
        })
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/search"]?.get;
    const queryParams = operation?.parameters?.filter((p) => p.in === "query");
    expect(queryParams?.find((p) => p.name === "required")?.required).toBe(
      true,
    );
    expect(queryParams?.find((p) => p.name === "optional")?.required).toBe(
      false,
    );
  });

  it("should generate correct operation IDs", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users": {
        get: baseRouter.procedure
          .output(z.array(z.object({ id: z.string() })))
          .handler(() => []),
        post: baseRouter.procedure
          .input({ body: z.object({ name: z.string() }) })
          .output(z.object({ id: z.string() }))
          .handler(() => ({ id: "1" })),
      },
      "/users/{id}/posts": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    expect(spec.paths["/api/users"]?.get?.operationId).toBe("getApiUsers");
    expect(spec.paths["/api/users"]?.post?.operationId).toBe("postApiUsers");
    expect(spec.paths["/api/users/{id}/posts"]?.get?.operationId).toBe(
      "getApiUsersIdPosts",
    );
  });

  it("should handle routes with both params and query", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/users/{id}": baseRouter.procedure
        .input({
          params: z.object({ id: z.string() }),
          query: z.object({ include: z.string().optional() }),
        })
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const spec = generateOpenAPISpec({ api: testRouter });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation?.parameters).toBeDefined();
    const pathParams = operation?.parameters?.filter((p) => p.in === "path");
    const queryParams = operation?.parameters?.filter((p) => p.in === "query");
    expect(pathParams?.length).toBe(1);
    expect(queryParams?.length).toBe(1);
  });

  it("should handle empty router", () => {
    const testRouter = router({});
    const spec = generateOpenAPISpec({ api: testRouter });

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.paths).toEqual({});
  });
});

describe("createDocsRouter", () => {
  it("should create a router that serves OpenAPI spec as JSON", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter({ api: testRouter });

    expect(docsRouter).toBeDefined();
    const procedures = docsRouter.getProcedures();
    expect(procedures.length).toBeGreaterThan(0);

    // Find the openapi.json endpoint
    const openapiProcedure = procedures.find(
      (p) => p.path === "/openapi.json",
    );
    expect(openapiProcedure).toBeDefined();
    expect(openapiProcedure?.method).toBe("GET");
  });

  it("should create a router that serves docs HTML", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter({ api: testRouter });

    const procedures = docsRouter.getProcedures();
    // Docs router always uses "/" internally, mount prefix determines final path
    const docsProcedure = procedures.find((p) => p.path === "/");
    expect(docsProcedure).toBeDefined();
    expect(docsProcedure?.method).toBe("GET");
  });

  it("should allow custom OpenAPI path", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter(
      { api: testRouter },
      { openapiPath: "/api-spec.json" },
    );

    const procedures = docsRouter.getProcedures();
    const openapiProcedure = procedures.find(
      (p) => p.path === "/api-spec.json",
    );
    expect(openapiProcedure).toBeDefined();
  });

  it("should serve docs at root path (mount prefix determines final path)", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter({ api: testRouter });

    const procedures = docsRouter.getProcedures();
    // Docs router always uses "/" internally, mount prefix determines final path
    const docsProcedure = procedures.find((p) => p.path === "/");
    expect(docsProcedure).toBeDefined();
  });

  it("should disable docs when enableDocs is false", () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter({ api: testRouter }, { enableDocs: false });

    const procedures = docsRouter.getProcedures();
    // Docs router always uses "/" internally when enabled, but should be undefined when disabled
    const docsProcedure = procedures.find((p) => p.path === "/");
    expect(docsProcedure).toBeUndefined();

    // OpenAPI JSON should still be available
    const openapiProcedure = procedures.find(
      (p) => p.path === "/openapi.json",
    );
    expect(openapiProcedure).toBeDefined();
  });

  it("should work with createServer integration", () => {
    const baseRouter = new Router();
    const apiRouter = router({
      "/users": baseRouter.procedure
        .output(z.array(z.object({ id: z.string() })))
        .get(() => []),
    });

    const docsRouter = createDocsRouter(
      { api: apiRouter },
      {
        title: "Test API",
        version: "1.0.0",
      },
    );

    const app = createServer({
      api: apiRouter,
      docs: docsRouter,
    });

    expect(app).toBeDefined();
  });

  it("should generate correct OpenAPI spec in the handler", async () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test/{id}": baseRouter.procedure
        .input({ params: z.object({ id: z.string() }) })
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter({ api: testRouter });

    const procedures = docsRouter.getProcedures();
    const openapiProcedure = procedures.find(
      (p) => p.path === "/openapi.json",
    );
    expect(openapiProcedure).toBeDefined();

    // Create a mock context to test the handler
    const mockHonoContext = {
      req: {
        param: () => ({}),
        query: () => ({}),
        json: async () => ({}),
        url: "http://localhost:3000/openapi.json",
        method: "GET",
      },
    } as any;

    const mockContext = {
      hono: mockHonoContext,
      input: {},
    } as any;

    if (openapiProcedure?.handler) {
      const result = await openapiProcedure.handler(mockContext);
      expect(result).toBeDefined();
      expect(result).toHaveProperty("openapi");
      expect(result).toHaveProperty("info");
      expect(result).toHaveProperty("paths");
    }
  });

  it("should use custom title and version in OpenAPI spec", async () => {
    const baseRouter = new Router();
    const testRouter = router({
      "/test": baseRouter.procedure
        .output(z.object({ id: z.string() }))
        .get(() => ({ id: "1" })),
    });

    const docsRouter = createDocsRouter(
      { api: testRouter },
      {
        title: "Custom API",
        version: "2.0.0",
        description: "Custom description",
      },
    );

    const procedures = docsRouter.getProcedures();
    const openapiProcedure = procedures.find(
      (p) => p.path === "/openapi.json",
    );

    const mockHonoContext = {
      req: {
        param: () => ({}),
        query: () => ({}),
        json: async () => ({}),
        url: "http://localhost:3000/openapi.json",
        method: "GET",
      },
    } as any;

    const mockContext = {
      hono: mockHonoContext,
      input: {},
    } as any;

    if (openapiProcedure?.handler) {
      const result = (await openapiProcedure.handler(mockContext)) as any;
      expect(result.info.title).toBe("Custom API");
      expect(result.info.version).toBe("2.0.0");
      expect(result.info.description).toBe("Custom description");
    }
  });
});
