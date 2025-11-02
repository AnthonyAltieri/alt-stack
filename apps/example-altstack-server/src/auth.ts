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
  // Add other user fields as needed
  // role: z.enum(["admin", "user"]).optional(),
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
  handler: async (request: Request) => {
    // Mock handler - in real app, Better Auth handles this
    return new Response("Auth routes handled by Better Auth", { status: 404 });
  },
  api: {
    getSession: async ({ headers }: { headers: Headers }) => {
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
