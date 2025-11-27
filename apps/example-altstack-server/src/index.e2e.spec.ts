import { describe, it, expect } from "vitest";
import app from "./index.js";

// ============================================================================
// Test Helpers
// ============================================================================

// User IDs from seeded data (matches index.ts)
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000001";
const REGULAR_USER_ID = "00000000-0000-0000-0000-000000000002";
const NON_EXISTENT_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

async function request(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  options?: { body?: unknown; headers?: Record<string, string> },
) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...(options?.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return app.fetch(req);
}

// Authenticated request helpers
function authHeaders(userId: string) {
  return { Authorization: userId };
}
const adminAuth = authHeaders(ADMIN_USER_ID);
const userAuth = authHeaders(REGULAR_USER_ID);

// Helper to create a todo and return its ID (uses valid v4 UUID from crypto.randomUUID)
async function createTestTodo(
  title: string,
  auth: Record<string, string> = userAuth,
): Promise<{ id: string; title: string; userId: string }> {
  const res = await request("POST", "/api/todos", {
    headers: auth,
    body: { title },
  });
  return res.json();
}

// ============================================================================
// Todo Router Tests
// ============================================================================

describe("GET /api/todos", () => {
  it("returns all todos (public endpoint)", async () => {
    const res = await request("GET", "/api/todos");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("filters by completed=true", async () => {
    const res = await request("GET", "/api/todos?completed=true");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    data.forEach((todo: { completed: boolean }) => {
      expect(todo.completed).toBe(true);
    });
  });

  it("filters by completed=false", async () => {
    const res = await request("GET", "/api/todos?completed=false");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    data.forEach((todo: { completed: boolean }) => {
      expect(todo.completed).toBe(false);
    });
  });

  it("returns 400 for invalid completed value", async () => {
    const res = await request("GET", "/api/todos?completed=maybe");
    expect(res.status).toBe(400);
  });
});

describe("POST /api/todos", () => {
  it("creates a new todo when authenticated", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: {
        title: "E2E Test Todo",
        description: "Created by e2e test",
      },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("E2E Test Todo");
    expect(data.description).toBe("Created by e2e test");
    expect(data.completed).toBe(false);
    expect(data.id).toBeDefined();
    expect(data.userId).toBe(REGULAR_USER_ID);
  });

  it("creates todo with only required fields", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { title: "Minimal Todo" },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Minimal Todo");
    expect(data.description).toBeUndefined();
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request("POST", "/api/todos", {
      body: { title: "Unauthenticated Todo" },
    });
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHORIZED");
  });

  it("returns 400 for missing title", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { description: "No title provided" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty title", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { title: "" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for title exceeding max length", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { title: "x".repeat(201) },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for description exceeding max length", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { title: "Valid", description: "x".repeat(1001) },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/todos/{id}", () => {
  it("returns a todo by id (public endpoint)", async () => {
    // Create a todo first to get a valid UUID
    const created = await createTestTodo("Test Get By ID");

    const res = await request("GET", `/api/todos/${created.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(created.id);
    expect(data.title).toBe("Test Get By ID");
  });

  it("returns 404 for non-existent todo", async () => {
    const res = await request("GET", `/api/todos/${NON_EXISTENT_UUID}`);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
    expect(data.error.message).toContain(NON_EXISTENT_UUID);
  });

  it("returns 400 for invalid UUID format", async () => {
    const res = await request("GET", "/api/todos/invalid-uuid");
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/todos/{id}", () => {
  it("updates own todo when authenticated", async () => {
    const created = await createTestTodo("To Update");

    const res = await request("PUT", `/api/todos/${created.id}`, {
      headers: userAuth,
      body: { title: "Updated Title", completed: true },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Updated Title");
    expect(data.completed).toBe(true);
  });

  it("admin can update any todo", async () => {
    // Create a todo as regular user
    const created = await createTestTodo("User's Todo", userAuth);

    // Admin updates it
    const res = await request("PUT", `/api/todos/${created.id}`, {
      headers: adminAuth,
      body: { title: "Admin Updated" },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.title).toBe("Admin Updated");
  });

  it("returns 403 when updating another user's todo", async () => {
    // Create todo as admin
    const created = await createTestTodo("Admin's Todo", adminAuth);

    // Regular user tries to update it
    const res = await request("PUT", `/api/todos/${created.id}`, {
      headers: userAuth,
      body: { title: "Hijacked" },
    });
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("returns 401 when not authenticated", async () => {
    const created = await createTestTodo("Auth Test");

    const res = await request("PUT", `/api/todos/${created.id}`, {
      body: { title: "Unauthorized Update" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent todo", async () => {
    const res = await request("PUT", `/api/todos/${NON_EXISTENT_UUID}`, {
      headers: userAuth,
      body: { title: "Won't work" },
    });
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

describe("PATCH /api/todos/{id}/complete", () => {
  it("marks a todo as complete", async () => {
    const created = await createTestTodo("Patch Complete Test");

    const res = await request("PATCH", `/api/todos/${created.id}/complete`, {
      headers: userAuth,
      body: { completed: true },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.completed).toBe(true);
  });

  it("marks a todo as incomplete", async () => {
    const created = await createTestTodo("To Uncomplete");

    // Complete it first
    await request("PATCH", `/api/todos/${created.id}/complete`, {
      headers: userAuth,
      body: { completed: true },
    });

    // Then mark incomplete
    const res = await request("PATCH", `/api/todos/${created.id}/complete`, {
      headers: userAuth,
      body: { completed: false },
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.completed).toBe(false);
  });

  it("returns 401 when not authenticated", async () => {
    const created = await createTestTodo("Auth Patch Test");

    const res = await request("PATCH", `/api/todos/${created.id}/complete`, {
      body: { completed: true },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent todo", async () => {
    const res = await request(
      "PATCH",
      `/api/todos/${NON_EXISTENT_UUID}/complete`,
      {
        headers: userAuth,
        body: { completed: true },
      },
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for missing completed field", async () => {
    const res = await request(
      "PATCH",
      `/api/todos/${NON_EXISTENT_UUID}/complete`,
      {
        headers: userAuth,
        body: {},
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/todos/{id}", () => {
  it("deletes a todo when authenticated", async () => {
    const created = await createTestTodo("To be deleted");

    const deleteRes = await request("DELETE", `/api/todos/${created.id}`, {
      headers: userAuth,
    });
    expect(deleteRes.status).toBe(200);

    const data = await deleteRes.json();
    expect(data.success).toBe(true);

    // Verify it's gone
    const getRes = await request("GET", `/api/todos/${created.id}`);
    expect(getRes.status).toBe(404);
  });

  it("returns 401 when not authenticated", async () => {
    const created = await createTestTodo("Delete Auth Test");

    const res = await request("DELETE", `/api/todos/${created.id}`);
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent todo", async () => {
    const res = await request("DELETE", `/api/todos/${NON_EXISTENT_UUID}`, {
      headers: userAuth,
    });
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

// ============================================================================
// User Router Tests
// ============================================================================

describe("GET /api/users/me", () => {
  it("returns current user profile when authenticated", async () => {
    const res = await request("GET", "/api/users/me", { headers: userAuth });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(REGULAR_USER_ID);
    expect(data.email).toBe("user@example.com");
    expect(data.role).toBe("user");
  });

  it("returns admin profile when authenticated as admin", async () => {
    const res = await request("GET", "/api/users/me", { headers: adminAuth });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(ADMIN_USER_ID);
    expect(data.email).toBe("admin@example.com");
    expect(data.role).toBe("admin");
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request("GET", "/api/users/me");
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error.code).toBe("UNAUTHORIZED");
  });
});

describe("GET /api/users/{id}", () => {
  it("returns 404 for non-existent user", async () => {
    const res = await request("GET", `/api/users/${NON_EXISTENT_UUID}`);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for invalid UUID format", async () => {
    const res = await request("GET", "/api/users/not-a-valid-uuid");
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Admin Router Tests
// ============================================================================

describe("GET /api/admin/users", () => {
  it("returns all users when authenticated as admin", async () => {
    const res = await request("GET", "/api/admin/users", {
      headers: adminAuth,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by role=admin", async () => {
    const res = await request("GET", "/api/admin/users?role=admin", {
      headers: adminAuth,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    data.forEach((user: { role: string }) => {
      expect(user.role).toBe("admin");
    });
  });

  it("filters by role=user", async () => {
    const res = await request("GET", "/api/admin/users?role=user", {
      headers: adminAuth,
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    data.forEach((user: { role: string }) => {
      expect(user.role).toBe("user");
    });
  });

  it("returns 401 when not authenticated", async () => {
    const res = await request("GET", "/api/admin/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as regular user", async () => {
    const res = await request("GET", "/api/admin/users", { headers: userAuth });
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });
});

describe("DELETE /api/admin/users/{id}", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(
      "DELETE",
      `/api/admin/users/${NON_EXISTENT_UUID}`,
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated as regular user", async () => {
    const res = await request(
      "DELETE",
      `/api/admin/users/${NON_EXISTENT_UUID}`,
      { headers: userAuth },
    );
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data.error.code).toBe("FORBIDDEN");
  });

  it("returns 404 for non-existent user when admin", async () => {
    const res = await request(
      "DELETE",
      `/api/admin/users/${NON_EXISTENT_UUID}`,
      { headers: adminAuth },
    );
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.error.code).toBe("NOT_FOUND");
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("Error Handling", () => {
  it("returns 404 for unknown routes", async () => {
    const res = await request("GET", "/api/unknown-route");
    expect(res.status).toBe(404);
  });

  it("handles malformed JSON gracefully", async () => {
    const req = new Request("http://localhost/api/todos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: REGULAR_USER_ID,
      },
      body: "{ invalid json }",
    });
    const res = await app.fetch(req);
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe("Input Validation", () => {
  it("validates params schema (UUID format)", async () => {
    const res = await request("GET", "/api/todos/not-a-uuid");
    expect(res.status).toBe(400);
  });

  it("validates query schema (enum values)", async () => {
    const res = await request("GET", "/api/todos?completed=maybe");
    expect(res.status).toBe(400);
  });

  it("validates body schema (string length)", async () => {
    const res = await request("POST", "/api/todos", {
      headers: userAuth,
      body: { title: "x".repeat(300) },
    });
    expect(res.status).toBe(400);
  });

  it("validates required body fields", async () => {
    const res = await request(
      "PATCH",
      `/api/todos/${NON_EXISTENT_UUID}/complete`,
      {
        headers: userAuth,
        body: {},
      },
    );
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Custom Error Response Structure Tests
// ============================================================================

describe("Error Response Structure", () => {
  it("returns properly structured 404 error", async () => {
    const res = await request("GET", `/api/todos/${NON_EXISTENT_UUID}`);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toHaveProperty("code", "NOT_FOUND");
    expect(data.error).toHaveProperty("message");
    expect(typeof data.error.message).toBe("string");
  });

  it("returns properly structured 401 error", async () => {
    const res = await request("GET", "/api/users/me");
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toHaveProperty("code", "UNAUTHORIZED");
    expect(data.error).toHaveProperty("message");
  });

  it("returns properly structured 403 error", async () => {
    const res = await request("GET", "/api/admin/users", { headers: userAuth });
    expect(res.status).toBe(403);

    const data = await res.json();
    expect(data).toHaveProperty("error");
    expect(data.error).toHaveProperty("code", "FORBIDDEN");
    expect(data.error).toHaveProperty("message");
  });
});
