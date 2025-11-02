import { describe, it, expect } from "vitest";
import {
  init,
  generateOpenAPISpec,
  createDocsRouter,
  createServer,
} from "../src/index.js";
import { z } from "zod";

describe("generateOpenAPISpec", () => {
  it("should generate OpenAPI spec for a simple GET route", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
      .handler(() => {
        return { id: "1", name: "Test" };
      });

    const spec = generateOpenAPISpec({ api: router });

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.info.title).toBe("API");
    expect(spec.info.version).toBe("1.0.0");
    expect(spec.paths["/api/test"]).toBeDefined();
    expect(spec.paths["/api/test"]?.get).toBeDefined();
    expect(spec.paths["/api/test"]?.get?.operationId).toBe("getApiTest");
    expect(spec.paths["/api/test"]?.get?.responses["200"]).toBeDefined();
  });

  it("should generate OpenAPI spec with custom info", () => {
    const t = init();
    const router = t.router().get("/test", {
      input: {},
      output: z.string(),
    }).handler(() => "test");

    const spec = generateOpenAPISpec(
      { api: router },
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
    const t = init();
    const router = t.router()
      .get("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
      .handler((ctx) => {
        return { id: ctx.input.id, name: "Test" };
      });

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation).toBeDefined();
    expect(operation?.parameters).toBeDefined();
    expect(operation?.parameters?.length).toBe(1);
    expect(operation?.parameters?.[0]?.name).toBe("id");
    expect(operation?.parameters?.[0]?.in).toBe("path");
    expect(operation?.parameters?.[0]?.required).toBe(true);
  });

  it("should handle query parameters", () => {
    const t = init();
    const router = t.router()
      .get("/search", {
        input: {
          query: z.object({
            q: z.string(),
            limit: z.number().optional(),
          }),
        },
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/search"]?.get;
    expect(operation?.parameters).toBeDefined();
    const queryParams = operation?.parameters?.filter((p) => p.in === "query");
    expect(queryParams?.length).toBe(2);
    expect(queryParams?.find((p) => p.name === "q")?.required).toBe(true);
    expect(queryParams?.find((p) => p.name === "limit")?.required).toBe(false);
  });

  it("should handle request body for POST", () => {
    const t = init();
    const router = t.router()
      .post("/users", {
        input: {
          body: z.object({
            name: z.string(),
            email: z.string().email(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
          email: z.string(),
        }),
      })
      .handler(() => {
        return { id: "1", name: "Test", email: "test@example.com" };
      });

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users"]?.post;
    expect(operation?.requestBody).toBeDefined();
    expect(operation?.requestBody?.required).toBe(true);
    expect(operation?.requestBody?.content["application/json"]).toBeDefined();
  });

  it("should handle request body for PUT", () => {
    const t = init();
    const router = t.router()
      .put("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
          body: z.object({
            name: z.string().optional(),
          }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users/{id}"]?.put;
    expect(operation?.requestBody).toBeDefined();
  });

  it("should handle request body for PATCH", () => {
    const t = init();
    const router = t.router()
      .patch("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
          body: z.object({
            name: z.string().optional(),
          }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users/{id}"]?.patch;
    expect(operation?.requestBody).toBeDefined();
  });

  it("should handle error responses", () => {
    const t = init();
    const router = t.router()
      .get("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
        }),
        errors: {
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
        },
      })
      .handler(() => ({ id: "1" }));

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation?.responses["200"]).toBeDefined();
    expect(operation?.responses["404"]).toBeDefined();
    expect(operation?.responses["500"]).toBeDefined();
  });

  it("should handle routes without output schema", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
      })
      .handler(() => ({ data: "test" }));

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/test"]?.get;
    expect(operation?.responses["200"]).toBeDefined();
    expect(operation?.responses["200"]?.content).toBeUndefined();
  });

  it("should handle routes without input schema", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.string(),
      })
      .handler(() => "test");

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/test"]?.get;
    expect(operation?.parameters).toBeUndefined();
  });

  it("should handle DELETE method", () => {
    const t = init();
    const router = t.router()
      .delete("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          success: z.boolean(),
        }),
      })
      .handler(() => ({ success: true }));

    const spec = generateOpenAPISpec({ api: router });

    expect(spec.paths["/api/users/{id}"]?.delete).toBeDefined();
    const operation = spec.paths["/api/users/{id}"]?.delete;
    expect(operation?.operationId).toBe("deleteApiUsersId");
  });

  it("should handle multiple routers with prefixes", () => {
    const t = init();
    const usersRouter = t.router()
      .get("/", {
        input: {},
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

    const postsRouter = t.router()
      .get("/", {
        input: {},
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

    const spec = generateOpenAPISpec({
      users: usersRouter,
      posts: postsRouter,
    });

    expect(spec.paths["/users"]).toBeDefined();
    expect(spec.paths["/posts"]).toBeDefined();
  });

  it("should handle multiple operations on same path", () => {
    const t = init();
    const router = t.router()
      .get("/items/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }))
      .patch("/items/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
          body: z.object({
            name: z.string().optional(),
          }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }))
      .delete("/items/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({ success: z.boolean() }),
      })
      .handler(() => ({ success: true }));

    const spec = generateOpenAPISpec({ api: router });

    const pathItem = spec.paths["/api/items/{id}"];
    expect(pathItem?.get).toBeDefined();
    expect(pathItem?.patch).toBeDefined();
    expect(pathItem?.delete).toBeDefined();
  });

  it("should handle array of routers", () => {
    const t = init();
    const router1 = t.router().get("/route1", {
      input: {},
      output: z.string(),
    }).handler(() => "test");

    const router2 = t.router().get("/route2", {
      input: {},
      output: z.string(),
    }).handler(() => "test");

    const spec = generateOpenAPISpec({
      api: [router1, router2],
    });

    expect(spec.paths["/api/route1"]).toBeDefined();
    expect(spec.paths["/api/route2"]).toBeDefined();
  });

  it("should handle complex nested object schemas", () => {
    const t = init();
    const router = t.router()
      .post("/users", {
        input: {
          body: z.object({
            name: z.string(),
            address: z.object({
              street: z.string(),
              city: z.string(),
              zip: z.string(),
            }),
            tags: z.array(z.string()),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
      })
      .handler(() => ({ id: "1", name: "Test" }));

    const spec = generateOpenAPISpec({ api: router });

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
    const t = init();
    const router = t.router()
      .get("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({
          id: z.string(),
          name: z.string(),
        }),
        errors: {
          404: z.object({
            error: z.object({
              code: z.literal("NOT_FOUND"),
              message: z.string(),
            }),
          }),
        },
      })
      .handler(() => ({ id: "1", name: "Test" }));

    const spec = generateOpenAPISpec({ api: router });

    // Check that components.schemas exists
    expect(spec.components).toBeDefined();
    expect(spec.components?.schemas).toBeDefined();

    // Check response schema
    const operation = spec.paths["/api/users/{id}"]?.get;
    const responseSchema = operation?.responses["200"]?.content?.["application/json"]?.schema;
    expect(responseSchema).toBeDefined();
    if (responseSchema && "$ref" in responseSchema) {
      const ref = (responseSchema as { $ref: string }).$ref;
      expect(ref).toMatch(/^#\/components\/schemas\//);
      const schemaName = ref.split("/").pop();
      expect(schemaName).toMatch(/Response$/);
      expect(spec.components?.schemas?.[schemaName || ""]).toBeDefined();
    }

    // Check error response schema
    const errorResponseSchema = operation?.responses["404"]?.content?.["application/json"]?.schema;
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
    const t = init();
    const router = t.router()
      .get("/search", {
        input: {
          query: z.object({
            required: z.string(),
            optional: z.string().optional(),
            nullable: z.string().nullable(),
          }),
        },
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

    const spec = generateOpenAPISpec({ api: router });

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
    const t = init();
    const router = t.router()
      .get("/users", {
        input: {},
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => [])
      .post("/users", {
        input: {
          body: z.object({ name: z.string() }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }))
      .get("/users/{id}/posts", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

    const spec = generateOpenAPISpec({ api: router });

    expect(spec.paths["/api/users"]?.get?.operationId).toBe("getApiUsers");
    expect(spec.paths["/api/users"]?.post?.operationId).toBe("postApiUsers");
    expect(spec.paths["/api/users/{id}/posts"]?.get?.operationId).toBe(
      "getApiUsersIdPosts",
    );
  });

  it("should handle routes with both params and query", () => {
    const t = init();
    const router = t.router()
      .get("/users/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
          query: z.object({
            include: z.string().optional(),
          }),
        },
        output: z.object({
          id: z.string(),
        }),
      })
      .handler(() => ({ id: "1" }));

    const spec = generateOpenAPISpec({ api: router });

    const operation = spec.paths["/api/users/{id}"]?.get;
    expect(operation?.parameters).toBeDefined();
    const pathParams = operation?.parameters?.filter((p) => p.in === "path");
    const queryParams = operation?.parameters?.filter((p) => p.in === "query");
    expect(pathParams?.length).toBe(1);
    expect(queryParams?.length).toBe(1);
  });

  it("should handle empty router", () => {
    const t = init();
    const router = t.router();
    const spec = generateOpenAPISpec({ api: router });

    expect(spec.openapi).toBe("3.0.0");
    expect(spec.paths).toEqual({});
  });
});

describe("createDocsRouter", () => {
  it("should create a router that serves OpenAPI spec as JSON", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter({ api: router });

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
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter({ api: router });

    const procedures = docsRouter.getProcedures();
    // Docs router always uses "/" internally, mount prefix determines final path
    const docsProcedure = procedures.find((p) => p.path === "/");
    expect(docsProcedure).toBeDefined();
    expect(docsProcedure?.method).toBe("GET");
  });

  it("should allow custom OpenAPI path", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter(
      { api: router },
      { openapiPath: "/api-spec.json" },
    );

    const procedures = docsRouter.getProcedures();
    const openapiProcedure = procedures.find(
      (p) => p.path === "/api-spec.json",
    );
    expect(openapiProcedure).toBeDefined();
  });

  it("should serve docs at root path (mount prefix determines final path)", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter({ api: router });

    const procedures = docsRouter.getProcedures();
    // Docs router always uses "/" internally, mount prefix determines final path
    const docsProcedure = procedures.find((p) => p.path === "/");
    expect(docsProcedure).toBeDefined();
  });

  it("should disable docs when enableDocs is false", () => {
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter(
      { api: router },
      { enableDocs: false },
    );

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
    const t = init();
    const apiRouter = t.router()
      .get("/users", {
        input: {},
        output: z.array(z.object({ id: z.string() })),
      })
      .handler(() => []);

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
    const t = init();
    const router = t.router()
      .get("/test/{id}", {
        input: {
          params: z.object({
            id: z.string(),
          }),
        },
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter({ api: router });

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
    const t = init();
    const router = t.router()
      .get("/test", {
        input: {},
        output: z.object({ id: z.string() }),
      })
      .handler(() => ({ id: "1" }));

    const docsRouter = createDocsRouter(
      { api: router },
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

