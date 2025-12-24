import {
  createDocsRouter,
  createServer,
  init,
  router,
  ok,
  err,
  TaggedError,
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
// Error Classes
// ============================================================================

class EmailExistsError extends TaggedError {
  readonly _tag = "EmailExistsError" as const;
  constructor(public readonly message: string = "Email already registered") {
    super(message);
  }
}

const EmailExistsErrorSchema = z.object({
  _tag: z.literal("EmailExistsError"),
  message: z.string(),
});

class InvalidCredentialsError extends TaggedError {
  readonly _tag = "InvalidCredentialsError" as const;
  constructor(public readonly message: string = "Invalid email or password") {
    super(message);
  }
}

const InvalidCredentialsErrorSchema = z.object({
  _tag: z.literal("InvalidCredentialsError"),
  message: z.string(),
});

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(public readonly message: string = "Authentication required") {
    super(message);
  }
}

const UnauthorizedErrorSchema = z.object({
  _tag: z.literal("UnauthorizedError"),
  message: z.string(),
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
      409: EmailExistsErrorSchema,
    })
    .post(({ input }) => {
      const existing = Array.from(users.values()).find((u) => u.email === input.body.email);
      if (existing) {
        return err(new EmailExistsError("Email already registered"));
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

      return ok({
        user: { id, email: user.email, name: user.name },
        session: { token, userId: id, expiresAt: expiresAt.toISOString() },
      });
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
      401: InvalidCredentialsErrorSchema,
    })
    .post(({ input }) => {
      const user = Array.from(users.values()).find((u) => u.email === input.body.email);
      if (!user || !verifyPassword(input.body.password, user.passwordHash)) {
        return err(new InvalidCredentialsError("Invalid email or password"));
      }

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      sessions.set(token, { userId: user.id, expiresAt });

      return ok({
        user: { id: user.id, email: user.email, name: user.name },
        session: { token, userId: user.id, expiresAt: expiresAt.toISOString() },
      });
    }),

  "/logout": publicProc.output(z.object({ success: z.boolean() })).post(({ ctx }) => {
    const auth = ctx.hono.req.header("Authorization") ?? "";
    const token = auth.replace("Bearer ", "");
    sessions.delete(token);
    return ok({ success: true });
  }),

  "/me": publicProc
    .output(UserSchema)
    .errors({
      401: UnauthorizedErrorSchema,
    })
    .get(({ ctx }) => {
      const auth = ctx.hono.req.header("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const session = sessions.get(token);
      if (!session || session.expiresAt < new Date()) {
        sessions.delete(token);
        return err(new UnauthorizedError("Invalid or expired session"));
      }

      const user = users.get(session.userId);
      if (!user) {
        return err(new UnauthorizedError("User not found"));
      }

      return ok({ id: user.id, email: user.email, name: user.name });
    }),

  // Internal endpoint for other services to validate tokens
  "/validate": publicProc
    .output(z.object({ valid: z.boolean(), userId: z.string().optional() }))
    .get(({ ctx }) => {
      const auth = ctx.hono.req.header("Authorization") ?? "";
      const token = auth.replace("Bearer ", "");
      const session = sessions.get(token);
      if (!session || session.expiresAt < new Date()) {
        return ok({ valid: false });
      }
      return ok({ valid: true, userId: session.userId });
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
