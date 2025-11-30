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
import { createDocsRouter, createServer, init, router } from "@alt-stack/server-hono";
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

const factory = init();
const publicProc = factory.procedure;

const authRouter = router({
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
      // Check if email exists, create user, create session
      // ...
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
      401: z.object({ error: z.object({ code: z.literal("INVALID_CREDENTIALS"), message: z.string() }) }),
    })
    .post(({ input, ctx }) => {
      // Verify credentials, create session
      // ...
    }),

  // Internal endpoint for other services to validate tokens
  "/validate": publicProc
    .input({ headers: z.object({ authorization: z.string() }) })
    .output(z.object({ valid: z.boolean(), userId: z.string().optional() }))
    .get(({ input }) => {
      const token = input.headers.authorization.replace("Bearer ", "");
      const session = sessions.get(token);
      if (!session || session.expiresAt < new Date()) {
        return { valid: false };
      }
      return { valid: true, userId: session.userId };
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
```

Run with:
```bash
pnpm --filter @real-life/backend-auth generate
```

