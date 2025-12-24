# Auth Service

The authentication service handles user registration, login, and session management.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/signup` | Register new user |
| POST | `/api/login` | Authenticate user |
| POST | `/api/logout` | Invalidate session |
| GET | `/api/me` | Get current user |
| GET | `/api/validate` | Validate token (internal) |

## Implementation

```typescript title="apps/backend-auth/src/index.ts"
import { createDocsRouter, createServer, init, router, ok, err, TaggedError, type HonoBaseContext } from "@alt-stack/server-hono";
import { z } from "zod";

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

// Error classes
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
      const existing = users.find(u => u.email === input.body.email);
      if (existing) {
        return err(new EmailExistsError("Email already registered"));
      }
      // Create user and session...
      return ok({ user: { id, email, name }, session: { token, userId, expiresAt } });
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
      const user = users.find(u => u.email === input.body.email);
      if (!user || !verifyPassword(input.body.password, user.passwordHash)) {
        return err(new InvalidCredentialsError("Invalid email or password"));
      }
      // Create session...
      return ok({ user: { id, email, name }, session: { token, userId, expiresAt } });
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
```

## Token Validation Endpoint

The `/validate` endpoint is designed for service-to-service communication. Other services can call it to verify tokens without implementing token parsing themselves.

```typescript
// In backend-logic
async function validateToken(token: string): Promise<string | null> {
  const res = await ky.get(`${AUTH_SERVICE_URL}/api/validate`, {
    headers: { authorization: token },
  }).json<{ valid: boolean; userId?: string }>();
  
  return res.valid ? (res.userId ?? null) : null;
}
```

## Generating the OpenAPI Spec

```typescript title="apps/backend-auth/src/generate-spec.ts"
import { writeFileSync } from "fs";
import { generateOpenAPISpec } from "@alt-stack/server-hono";
import { authRouter } from "./index.js";

const spec = generateOpenAPISpec({ api: authRouter }, {
  title: "Auth API",
  version: "1.0.0",
});

writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
console.log("Generated openapi.json");
```

Run with:
```bash
pnpm --filter @real-life/backend-auth generate
```

