import { createApiClient } from "@alt-stack/http-client-ky";
import { Request as AuthRequest, Response as AuthResponse } from "@real-life/backend-auth-sdk";
import { Request as LogicRequest, Response as LogicResponse } from "@real-life/backend-logic-sdk";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3001";
const LOGIC_URL = process.env.NEXT_PUBLIC_LOGIC_URL || "http://localhost:3002";

// ============================================================================
// Type-Safe API Clients
// ============================================================================

const authClient = createApiClient({
  baseUrl: AUTH_URL,
  Request: AuthRequest,
  Response: AuthResponse,
});

const logicClient = createApiClient({
  baseUrl: LOGIC_URL,
  Request: LogicRequest,
  Response: LogicResponse,
});

// ============================================================================
// Auth API
// ============================================================================

// Helper to extract error message from SDK error responses
function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "error" in error) {
    const inner = (error as { error: unknown }).error;
    if (inner && typeof inner === "object" && "message" in inner) {
      return (inner as { message: string }).message;
    }
  }
  return fallback;
}

export const authApi = {
  async signup(data: { email: string; password: string; name: string }) {
    const result = await authClient.post("/api/signup", { body: data });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Signup failed"));
    return result.body;
  },

  async login(data: { email: string; password: string }) {
    const result = await authClient.post("/api/login", { body: data });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Login failed"));
    return result.body;
  },

  async logout(token: string) {
    await authClient.post("/api/logout", {
      body: undefined,
      headers: { authorization: `Bearer ${token}` },
    } as any);
  },

  async me(token: string) {
    const result = await authClient.get("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Failed to get user"));
    return result.body;
  },
};

// ============================================================================
// Logic API
// ============================================================================

export const logicApi = {
  async listTasks(token?: string) {
    const result = await logicClient.get("/api/", {
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
    });
    if (!result.success) throw new Error("Failed to list tasks");
    return result.body;
  },

  async createTask(token: string, data: { title: string; description?: string }) {
    const result = await logicClient.post("/api/", {
      body: data,
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Failed to create task"));
    return result.body;
  },

  async updateTask(
    token: string,
    id: string,
    data: {
      title?: string;
      description?: string;
      status?: "pending" | "in_progress" | "completed";
    },
  ) {
    const result = await logicClient.put("/api/{id}", {
      params: { id },
      body: data,
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Failed to update task"));
    return result.body;
  },

  async deleteTask(token: string, id: string) {
    const result = await logicClient.delete("/api/{id}", {
      params: { id },
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result.success) throw new Error(getErrorMessage(result.error, "Failed to delete task"));
  },
};
