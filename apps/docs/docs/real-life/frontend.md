# Frontend

NextJS app consuming both backend services via generated SDKs.

## API Client

The frontend uses `@alt-stack/http-client-ky` for type-safe HTTP requests with SDK schemas:

```typescript title="apps/web/src/lib/api.ts"
import { createApiClient } from "@alt-stack/http-client-ky";
import { Request as AuthRequest, Response as AuthResponse } from "@real-life/backend-auth-sdk";
import { Request as LogicRequest, Response as LogicResponse } from "@real-life/backend-logic-sdk";

const AUTH_URL = process.env.NEXT_PUBLIC_AUTH_URL || "http://localhost:3001";
const LOGIC_URL = process.env.NEXT_PUBLIC_LOGIC_URL || "http://localhost:3002";

// Create type-safe clients
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

// Auth API
export const authApi = {
  async login(data: { email: string; password: string }) {
    const result = await authClient.post("/api/login", { body: data });
    if (!result.success) throw new Error("Login failed");
    return result.body;
  },

  async me(token: string) {
    const result = await authClient.get("/api/me", {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!result.success) throw new Error("Failed to get user");
    return result.body;
  },
};

// Logic API
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
    if (!result.success) throw new Error("Failed to create task");
    return result.body;
  },
};
```

## Type Safety

The `http-client-ky` client provides full type inference from the SDK's `Request` and `Response` objects:

```typescript
// TypeScript knows:
// - Valid endpoints: "/api/", "/api/{id}"
// - Required params/body for each endpoint
// - Response body type for each status code
const result = await logicClient.get("/api/", {
  headers: token ? { authorization: `Bearer ${token}` } : undefined,
});

if (result.success) {
  // result.body is typed as Task[]
  result.body.forEach(task => {
    console.log(task.title);  // ✅ TypeScript knows this exists
    console.log(task.status); // ✅ "pending" | "in_progress" | "completed"
  });
} else {
  // result.error is typed based on the error response schema
  console.error(result.error);
}
```

## React Component

```typescript title="apps/web/src/app/page.tsx"
"use client";

import { useState, useEffect } from "react";
import { authApi, logicApi } from "@/lib/api";
import type { z } from "zod";
import type { TaskSchema } from "@real-life/backend-logic-sdk";

type Task = z.infer<typeof TaskSchema>;

export default function Home() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Load token from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("auth_token");
    if (saved) setToken(saved);
  }, []);

  // Fetch user and tasks when token changes
  useEffect(() => {
    if (!token) return;
    authApi.me(token).then(setUser).catch(() => setToken(null));
    logicApi.listTasks(token).then(setTasks);
  }, [token]);

  const handleLogin = async (email: string, password: string) => {
    const result = await authApi.login({ email, password });
    localStorage.setItem("auth_token", result.session.token);
    setToken(result.session.token);
  };

  const handleCreateTask = async (title: string) => {
    if (!token) return;
    const task = await logicApi.createTask(token, { title });
    setTasks([...tasks, task]);
  };

  // ... render UI
}
```

## NextJS Configuration

Configure transpilation for workspace packages:

```javascript title="apps/web/next.config.js"
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@real-life/backend-auth-sdk",
    "@real-life/backend-logic-sdk",
  ],
};

module.exports = nextConfig;
```
