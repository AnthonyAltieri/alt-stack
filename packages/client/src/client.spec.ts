import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { ApiClient, createApiClient } from "./client.js";
import { TimeoutError, UnexpectedApiClientError, ValidationError } from "./errors.js";

// Test schemas
const Request = {
  "/users": {
    GET: {
      query: z.object({ limit: z.number().optional() }),
    },
    POST: {
      body: z.object({ name: z.string(), email: z.string().email() }),
    },
  },
  "/users/{id}": {
    GET: {
      params: z.object({ id: z.string().uuid() }),
    },
  },
  "/posts/{postId}/comments/{commentId}": {
    GET: {
      params: z.object({ postId: z.string(), commentId: z.string() }),
    },
  },
} as const;

const Response = {
  "/users": {
    GET: {
      "200": z.array(z.object({ id: z.string(), name: z.string() })),
    },
    POST: {
      "201": z.object({ id: z.string(), name: z.string() }),
      "400": z.object({ code: z.string(), message: z.string() }),
    },
  },
  "/users/{id}": {
    GET: {
      "200": z.object({ id: z.string(), name: z.string() }),
      "404": z.object({ code: z.string(), message: z.string() }),
    },
  },
} as const;

function createMockFetch(response: unknown, status = 200, statusText = "OK") {
  return vi.fn().mockResolvedValue({
    status,
    statusText,
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve(response),
    text: () => Promise.resolve(JSON.stringify(response)),
  });
}

describe("ApiClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("createApiClient", () => {
    it("creates an ApiClient instance", () => {
      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request,
        Response,
      });
      expect(client).toBeInstanceOf(ApiClient);
    });
  });

  describe("GET requests", () => {
    it("makes a basic GET request", async () => {
      const mockData = [{ id: "1", name: "John" }];
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {});

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({ method: "GET" }),
      );
      expect(result).toEqual({ success: true, body: mockData, code: "200" });
    });

    it("includes query parameters in URL", async () => {
      const mockData = [{ id: "1", name: "John" }];
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      await client.get("/users", { query: { limit: 10 } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users?limit=10",
        expect.any(Object),
      );
    });

    it("interpolates path parameters", async () => {
      const mockData = { id: "abc-123", name: "John" };
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      await client.get("/users/{id}", { params: { id: "550e8400-e29b-41d4-a716-446655440000" } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/550e8400-e29b-41d4-a716-446655440000",
        expect.any(Object),
      );
    });

    it("interpolates multiple path parameters", async () => {
      const mockData = { id: "1", content: "test" };
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request,
        Response: {
          "/posts/{postId}/comments/{commentId}": {
            GET: { "200": z.object({ id: z.string(), content: z.string() }) },
          },
        },
      });
      await client.get("/posts/{postId}/comments/{commentId}", {
        params: { postId: "post-1", commentId: "comment-2" },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/posts/post-1/comments/comment-2",
        expect.any(Object),
      );
    });

    it("merges custom headers with default headers", async () => {
      globalThis.fetch = createMockFetch([]);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        headers: { Authorization: "Bearer token" },
        Request,
        Response,
      });
      await client.get("/users", { headers: { "X-Custom": "value" } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            Authorization: "Bearer token",
            "X-Custom": "value",
          }),
        }),
      );
    });
  });

  describe("POST requests", () => {
    it("makes a POST request with body", async () => {
      const mockResponse = { id: "1", name: "John" };
      globalThis.fetch = createMockFetch(mockResponse, 201);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.post("/users", {
        body: { name: "John", email: "john@example.com" },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "John", email: "john@example.com" }),
        }),
      );
      expect(result).toEqual({ success: true, body: mockResponse, code: "201" });
    });

    it("returns error response for 400", async () => {
      const errorBody = { code: "INVALID_EMAIL", message: "Invalid email format" };
      globalThis.fetch = createMockFetch(errorBody, 400, "Bad Request");

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.post("/users", {
        body: { name: "John", email: "john@example.com" },
      });

      expect(result.success).toBe(false);
      if (!result.success && typeof result.code === "string") {
        expect(result.code).toBe("400");
        expect(result.error).toEqual(errorBody);
      }
    });
  });

  describe("PUT requests", () => {
    it("makes a PUT request with body", async () => {
      const mockResponse = { id: "1", name: "John Updated" };
      globalThis.fetch = createMockFetch(mockResponse, 200);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: {
          "/users/{id}": {
            PUT: {
              params: z.object({ id: z.string() }),
              body: z.object({ name: z.string() }),
            },
          },
        },
        Response: {
          "/users/{id}": {
            PUT: { "200": z.object({ id: z.string(), name: z.string() }) },
          },
        },
      });
      const result = await client.put("/users/{id}", {
        params: { id: "1" },
        body: { name: "John Updated" },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ name: "John Updated" }),
        }),
      );
      expect(result).toEqual({ success: true, body: mockResponse, code: "200" });
    });
  });

  describe("PATCH requests", () => {
    it("makes a PATCH request with body", async () => {
      const mockResponse = { id: "1", name: "John", email: "new@example.com" };
      globalThis.fetch = createMockFetch(mockResponse, 200);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: {
          "/users/{id}": {
            PATCH: {
              params: z.object({ id: z.string() }),
              body: z.object({ email: z.string().email().optional() }),
            },
          },
        },
        Response: {
          "/users/{id}": {
            PATCH: { "200": z.object({ id: z.string(), name: z.string(), email: z.string() }) },
          },
        },
      });
      const result = await client.patch("/users/{id}", {
        params: { id: "1" },
        body: { email: "new@example.com" },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ email: "new@example.com" }),
        }),
      );
      expect(result).toEqual({ success: true, body: mockResponse, code: "200" });
    });
  });

  describe("DELETE requests", () => {
    it("makes a DELETE request", async () => {
      globalThis.fetch = createMockFetch(null, 204, "No Content");

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: {
          "/users/{id}": {
            DELETE: {
              params: z.object({ id: z.string() }),
            },
          },
        },
        Response: {
          "/users/{id}": {
            DELETE: { "204": z.null() },
          },
        },
      });
      const result = await client.delete("/users/{id}", {
        params: { id: "1" },
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/users/1",
        expect.objectContaining({ method: "DELETE" }),
      );
      expect(result.success).toBe(true);
    });

    it("does not include body in DELETE request", async () => {
      globalThis.fetch = createMockFetch(null, 204);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: { "/items/{id}": { DELETE: { params: z.object({ id: z.string() }) } } },
        Response: { "/items/{id}": { DELETE: { "204": z.null() } } },
      });
      await client.delete("/items/{id}", { params: { id: "1" } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/items/1",
        expect.not.objectContaining({ body: expect.anything() }),
      );
    });
  });

  describe("validation", () => {
    it("throws ValidationError for invalid path params", async () => {
      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(client.get("/users/{id}", { params: { id: "not-a-uuid" } })).rejects.toThrow(
        ValidationError,
      );
    });

    it("throws ValidationError for invalid body", async () => {
      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(
        client.post("/users", { body: { name: "John", email: "not-an-email" } }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing required path params", async () => {
      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: { "/users/{id}": { GET: {} } },
        Response: { "/users/{id}": { GET: { "200": z.any() } } },
      });

      // @ts-expect-error - intentionally passing empty params to test validation
      await expect(client.get("/users/{id}", { params: {} })).rejects.toThrow(ValidationError);
    });
  });

  describe("response handling", () => {
    it("returns success response for 2xx status", async () => {
      const mockData = [{ id: "1", name: "John" }];
      globalThis.fetch = createMockFetch(mockData, 200);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.body).toEqual(mockData);
        expect(result.code).toBe("200");
      }
    });

    it("returns error response for defined error codes", async () => {
      const errorBody = { code: "NOT_FOUND", message: "User not found" };
      globalThis.fetch = createMockFetch(errorBody, 404);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users/{id}", {
        params: { id: "550e8400-e29b-41d4-a716-446655440000" },
      });

      expect(result.success).toBe(false);
      if (!result.success && typeof result.code === "string") {
        expect(result.code).toBe("404");
        expect(result.error).toEqual(errorBody);
      }
    });

    it("returns UnexpectedErrorResponse for undefined error codes", async () => {
      globalThis.fetch = createMockFetch({ error: "Server error" }, 500, "Internal Server Error");

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.code).toBe(500);
        expect(result.error).toBeInstanceOf(UnexpectedApiClientError);
      }
    });

    it("returns UnexpectedErrorResponse when response validation fails", async () => {
      // Return data that doesn't match the expected schema
      const invalidData = [{ id: 123, name: 456 }]; // id and name should be strings
      globalThis.fetch = createMockFetch(invalidData, 200);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(UnexpectedApiClientError);
      }
    });

    it("handles text responses", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "text/plain" }),
        text: () => Promise.resolve("Hello, World!"),
      });

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: { "/text": { GET: {} } },
        Response: { "/text": { GET: { "200": z.string() } } },
      });
      const result = await client.get("/text", {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.body).toBe("Hello, World!");
      }
    });
  });

  describe("retry logic", () => {
    it("does not retry on 5xx errors (they are valid HTTP responses)", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.resolve({
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "Service Unavailable" }),
        });
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", { retries: 3 });

      // 5xx responses are valid HTTP responses, not network errors, so no retry
      expect(attempts).toBe(1);
      expect(result.success).toBe(false);
    });

    it("does not retry on 4xx errors", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.resolve({
          status: 400,
          statusText: "Bad Request",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ code: "BAD_REQUEST", message: "Invalid request" }),
        });
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.post("/users", {
        body: { name: "John", email: "john@example.com" },
        retries: 3,
      });

      expect(attempts).toBe(1);
      expect(result.success).toBe(false);
    });

    it("does not retry on validation errors", async () => {
      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(
        client.get("/users/{id}", { params: { id: "invalid" }, retries: 3 }),
      ).rejects.toThrow(ValidationError);
    });

    it("retries on network errors", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve([{ id: "1", name: "John" }]),
        });
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", { retries: 2 });

      expect(attempts).toBe(2);
      expect(result.success).toBe(true);
    });

    it("throws after all retries exhausted", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(client.get("/users", { retries: 2 })).rejects.toThrow(UnexpectedApiClientError);
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("shouldRetry option", () => {
    it("retries on 5xx when shouldRetry returns true", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve({
            status: 503,
            statusText: "Service Unavailable",
            headers: new Headers({ "content-type": "application/json" }),
            json: () => Promise.resolve({ error: "Service Unavailable" }),
          });
        }
        return Promise.resolve({
          status: 200,
          statusText: "OK",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve([{ id: "1", name: "John" }]),
        });
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {
        retries: 3,
        shouldRetry: ({ response }) => response !== undefined && response.status >= 500,
      });

      expect(attempts).toBe(3);
      expect(result.success).toBe(true);
    });

    it("stops retrying when shouldRetry returns false for errors", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.reject(new Error("Network error"));
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(
        client.get("/users", {
          retries: 5,
          shouldRetry: ({ attempt }) => attempt < 1, // Only retry once
        }),
      ).rejects.toThrow(UnexpectedApiClientError);

      expect(attempts).toBe(2); // Initial + 1 retry
    });

    it("receives correct context in shouldRetry callback", async () => {
      const contexts: unknown[] = [];
      const shouldRetry = vi.fn().mockImplementation((ctx) => {
        contexts.push(ctx);
        return ctx.attempt < 1; // Only retry once
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ error: "Server error" }),
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      await client.get("/users", { retries: 3, shouldRetry });

      expect(shouldRetry).toHaveBeenCalledTimes(2);
      expect(contexts[0]).toEqual({
        attempt: 0,
        response: {
          status: 500,
          statusText: "Internal Server Error",
          data: { error: "Server error" },
        },
      });
      expect(contexts[1]).toEqual({
        attempt: 1,
        response: {
          status: 500,
          statusText: "Internal Server Error",
          data: { error: "Server error" },
        },
      });
    });

    it("receives error in context for network failures", async () => {
      const shouldRetry = vi.fn().mockReturnValue(false);
      const networkError = new Error("Connection refused");

      globalThis.fetch = vi.fn().mockRejectedValue(networkError);

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(client.get("/users", { retries: 3, shouldRetry })).rejects.toThrow();

      expect(shouldRetry).toHaveBeenCalledTimes(1);
      expect(shouldRetry).toHaveBeenCalledWith({
        attempt: 0,
        error: expect.any(UnexpectedApiClientError),
      });
    });

    it("returns last response when all retries exhausted with shouldRetry", async () => {
      let attempts = 0;
      globalThis.fetch = vi.fn().mockImplementation(() => {
        attempts++;
        return Promise.resolve({
          status: 503,
          statusText: "Service Unavailable",
          headers: new Headers({ "content-type": "application/json" }),
          json: () => Promise.resolve({ error: "Still unavailable" }),
        });
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });
      const result = await client.get("/users", {
        retries: 2,
        shouldRetry: ({ response }) => response !== undefined && response.status >= 500,
      });

      // 1 initial + 2 retries = 3 total attempts
      expect(attempts).toBe(3);
      expect(result.success).toBe(false);
    });
  });

  describe("timeout", () => {
    it("throws TimeoutError when request exceeds timeout", async () => {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";

      globalThis.fetch = vi.fn().mockImplementation(() => {
        return Promise.reject(abortError);
      });

      const client = createApiClient({ baseUrl: "https://api.example.com", Request, Response });

      await expect(client.get("/users", { timeout: 100 })).rejects.toThrow(TimeoutError);
    });
  });

  describe("query string building", () => {
    it("omits undefined and null values", async () => {
      globalThis.fetch = createMockFetch([]);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: {
          "/search": {
            GET: {
              query: z.object({
                q: z.string(),
                page: z.number().optional(),
                filter: z.string().nullable().optional(),
              }),
            },
          },
        },
        Response: { "/search": { GET: { "200": z.array(z.any()) } } },
      });

      await client.get("/search", { query: { q: "test", page: undefined, filter: null } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/search?q=test",
        expect.any(Object),
      );
    });
  });

  describe("endpoint without schema", () => {
    it("handles endpoints without response schema", async () => {
      const mockData = { foo: "bar" };
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: { "/untyped": { GET: {} } },
        Response: {},
      });
      const result = await client.get("/untyped", {});

      // When no response schema, success responses still return body
      expect(result.success).toBe(true);
      expect("body" in result && result.body).toEqual(mockData);
    });

    it("handles endpoints without request schema but with path params", async () => {
      const mockData = { id: "123" };
      globalThis.fetch = createMockFetch(mockData);

      const client = createApiClient({
        baseUrl: "https://api.example.com",
        Request: { "/items/{id}": { GET: {} } },
        Response: {},
      });
      const result = await client.get("/items/{id}", { params: { id: "123" } });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://api.example.com/items/123",
        expect.any(Object),
      );
      expect(result.success).toBe(true);
    });
  });
});
