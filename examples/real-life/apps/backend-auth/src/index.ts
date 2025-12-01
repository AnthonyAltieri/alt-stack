import {
  createDocsRouter,
  createServer,
  init,
  router,
  type HonoBaseContext,
} from "@alt-stack/server-hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { env } from "./env.js";

// ============================================================================
// Types
// ============================================================================

const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});

const SessionSchema = z.object({
  token: z.string(),
  userId: z.string(),
  expiresAt: z.string().datetime(),
});

// ============================================================================
// In-Memory Store
// ============================================================================

interface StoredUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
}

const users = new Map<string, StoredUser>();
const sessions = new Map<string, { userId: string; expiresAt: Date }>();

// Simple password hashing (demo only - use bcrypt in production)
const hashPassword = (password: string) => `hashed:${password}`;
const verifyPassword = (password: string, hash: string) => hash === `hashed:${password}`;

// ============================================================================
// Procedures
// ============================================================================

const factory = init<HonoBaseContext>();
const publicProc = factory.procedure;

const authRouter = router<HonoBaseContext>({
  "/signup": publicProc
    .input({
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
      }),
    })
    .output(z.object({ user: UserSchema, session: SessionSchema }))
    .errors({
      409: z.object({ error: z.object({ code: z.literal("EMAIL_EXISTS"), message: z.string() }) }),
    })
    .post(({ input, ctx }) => {
      const existing = Array.from(users.values()).find((u) => u.email === input.body.email);
      if (existing) {
        throw ctx.error({ error: { code: "EMAIL_EXISTS", message: "Email already registered" } });
      }

      const id = crypto.randomUUID();
      const user: StoredUser = {
        id,
        email: input.body.email,
        name: input.body.name,
        passwordHash: hashPassword(input.body.password),
      };
      users.set(id, user);

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(token, { userId: id, expiresAt });

      return {
        user: { id, email: user.email, name: user.name },
        session: { token, userId: id, expiresAt: expiresAt.toISOString() },
      };
    }),

  "/login": publicProc
    .input({
      body: z.object({
        email: z.string().email(),
        password: z.string(),
      }),
    })
    .output(z.object({ user: UserSchema, session: SessionSchema }))
    .errors({
      401: z.object({
        error: z.object({ code: z.literal("INVALID_CREDENTIALS"), message: z.string() }),
      }),
    })
    .post(({ input, ctx }) => {
      const user = Array.from(users.values()).find((u) => u.email === input.body.email);
      if (!user || !verifyPassword(input.body.password, user.passwordHash)) {
        throw ctx.error({
          error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" },
        });
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(token, { userId: user.id, expiresAt });

      return {
        user: { id: user.id, email: user.email, name: user.name },
        session: { token, userId: user.id, expiresAt: expiresAt.toISOString() },
      };
    }),

  "/logout": publicProc.output(z.object({ success: z.boolean() })).post(({ ctx }) => {
    const auth = ctx.hono.req.header("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    sessions.delete(token);
    return { success: true };
  }),

  "/me": publicProc
    .output(UserSchema)
    .errors({
      401: z.object({ error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }) }),
    })
    .get(({ ctx }) => {
      const auth = ctx.hono.req.header("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const session = sessions.get(token);
      if (!session || session.expiresAt < new Date()) {
        sessions.delete(token);
        throw ctx.error({ error: { code: "UNAUTHORIZED", message: "Invalid or expired session" } });
      }

      const user = users.get(session.userId);
      if (!user) {
        throw ctx.error({ error: { code: "UNAUTHORIZED", message: "User not found" } });
      }

      return { id: user.id, email: user.email, name: user.name };
    }),

  // Internal endpoint for other services to validate tokens
  "/validate": publicProc
    .output(z.object({ valid: z.boolean(), userId: z.string().optional() }))
    .get(({ ctx }) => {
      const auth = ctx.hono.req.header("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const session = sessions.get(token);
      if (!session || session.expiresAt < new Date()) {
        return { valid: false };
      }
      return { valid: true, userId: session.userId };
    }),
});

// ============================================================================
// Server
// ============================================================================

const docsRouter = createDocsRouter<HonoBaseContext>(
  { api: authRouter },
  { title: "Auth API", version: "1.0.0" },
);

// Enable OpenTelemetry tracing in production:
// const app = createServer<HonoBaseContext>(
//   { api: authRouter, docs: docsRouter },
//   {
//     telemetry: {
//       enabled: env.NODE_ENV === "production",
//       serviceName: "backend-auth",
//       ignoreRoutes: ["/docs"],
//     },
//   },
// );
const app = createServer<HonoBaseContext>({ api: authRouter, docs: docsRouter });

export { authRouter };
export default app;

// Only start server when running directly (not as Lambda)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  console.log(`Auth service running at http://localhost:${env.PORT}`);
  console.log(`OpenAPI docs at http://localhost:${env.PORT}/docs/openapi.json`);
  serve({ fetch: app.fetch, port: env.PORT });
}
