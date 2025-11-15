import { z } from "zod";
// Note: In a real app, you would import betterAuth from "better-auth"
// and set it up with your database adapter
// import { betterAuth } from "better-auth";
// import { drizzleAdapter } from "better-auth/adapters/drizzle";

// Define your user schema with Zod for validation
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: z.enum(["admin", "user"]),
  // Add other user fields as needed
  // image: z.string().url().optional(),
});

// Schema for Better Auth session
export const SessionSchema = z.object({
  user: UserSchema,
  session: z.object({
    id: z.string(),
    userId: z.string(),
    expiresAt: z.date(),
  }),
});

// Infer TypeScript types from Zod schemas
export type User = z.infer<typeof UserSchema>;
export type Session = z.infer<typeof SessionSchema>;

// Mock auth instance for example purposes
// In a real app, this would be:
// export const auth = betterAuth({
//   database: drizzleAdapter(db, { provider: "pg" }),
//   emailAndPassword: { enabled: true },
// });
export const auth = {
  handler: async (_request: Request) => {
    // Mock handler - in real app, Better Auth handles this
    return new Response("Auth routes handled by Better Auth", { status: 404 });
  },
  api: {
    getSession: async ({ headers: _headers }: { headers: Headers }) => {
      // Mock session retrieval - in real app, Better Auth handles this
      // This would typically read from cookies/headers and validate session
      return null;
    },
  },
};

/**
 * Get and validate the authenticated session from Better Auth
 * Returns null if no valid session exists
 */
export async function getAuthSession(
  request: Request,
): Promise<Session | null> {
  const session = await auth.api.getSession({ headers: request.headers });

  // Validate and parse the session with safeParse for optional validation
  const result = SessionSchema.safeParse(session);

  if (!result.success) {
    // Log validation errors in development
    // Note: NODE_ENV is available via env but we check it here for development logging
    if (process.env.NODE_ENV === "development") {
      console.warn("Session validation failed:", result.error);
    }
    return null;
  }

  return result.data;
}

/**
 * Get and validate the authenticated user from Better Auth session
 * Returns null if no valid session/user exists
 */
export async function getAuthUser(request: Request): Promise<User | null> {
  const session = await getAuthSession(request);
  return session?.user ?? null;
}

// Mock user store for example purposes
class UserStore {
  private users: Map<string, User> = new Map();

  constructor() {
    // Add some mock users
    this.users.set("1", {
      id: "1",
      email: "admin@example.com",
      name: "Admin User",
      role: "admin",
    });
    this.users.set("2", {
      id: "2",
      email: "user@example.com",
      name: "Regular User",
      role: "user",
    });
  }

  getAll(): User[] {
    return Array.from(this.users.values());
  }

  getById(id: string): User | undefined {
    return this.users.get(id);
  }

  delete(id: string): boolean {
    return this.users.delete(id);
  }
}

const userStore = new UserStore();

// Helper functions matching the kitchen sink example
export function getAllUsers(): User[] {
  return userStore.getAll();
}

export function getUserById(id: string): User | null {
  return userStore.getById(id) ?? null;
}

export function deleteUser(id: string): void {
  userStore.delete(id);
}

/**
 * Mock function to get user from request
 * In a real app, this would extract user from JWT token or session
 */
export async function getUserFromRequest(
  request: Request,
): Promise<User | null> {
  // For demo purposes, check for Authorization header
  const authHeader = request.headers.get("Authorization");
  if (authHeader === "Bearer admin") {
    return userStore.getById("1") ?? null;
  }
  if (authHeader === "Bearer user") {
    return userStore.getById("2") ?? null;
  }
  return null;
}
