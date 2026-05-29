# @alt-stack/server-tanstack-start

TanStack Start server route adapter for Alt Stack.

Use it when you want TanStack Start and TanStack Router files to stay idiomatic, while defining request validation, output validation, typed errors, middleware, and handlers with Alt Stack.

```ts
// src/routes/api/todos/$id.ts
import { z } from "zod";
import {
  createAltStackFileRoute,
  init,
  ok,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const Route = createAltStackFileRoute("/api/todos/$id")({
  server: {
    handlers: {
      GET: t.procedure
        .input({
          params: z.object({ id: z.string().uuid() }),
          query: z.object({ includeCompleted: z.enum(["true", "false"]).optional() }),
        })
        .output(
          z.object({
            id: z.string(),
            title: z.string(),
            completed: z.boolean(),
          }),
        )
        .handler(({ input }) =>
          ok({
            id: input.params.id,
            title: "Write adapter",
            completed: input.query.includeCompleted === "true",
          }),
        ),
    },
  },
});
```

`createAltStackFileRoute` wraps TanStack's `createFileRoute` and attaches Alt Stack route metadata to the returned `Route`. The route path is defined once, uses TanStack's `$id` syntax, and is converted to Alt Stack's `{id}` path syntax internally for validation and OpenAPI. HTTP verbs live under `server.handlers` and use TanStack's uppercase method keys.

## OpenAPI

Export the `Route` object from each route module, then collect those exports in one OpenAPI registry file.

```ts
// src/routes/api/todos/index.ts
import { z } from "zod";
import { createAltStackFileRoute, init, ok, type TanStackBaseContext } from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const Route = createAltStackFileRoute("/api/todos")({
  server: {
    handlers: {
      GET: t.procedure
        .output(z.array(z.object({ id: z.string(), title: z.string() })))
        .handler(() => ok([])),
    },
  },
});
```

```ts
// src/routes/api/todos/$id.ts
import { z } from "zod";
import { createAltStackFileRoute, init, ok, type TanStackBaseContext } from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const Route = createAltStackFileRoute("/api/todos/$id")({
  server: {
    handlers: {
      GET: t.procedure
        .input({ params: z.object({ id: z.string().uuid() }) })
        .output(z.object({ id: z.string(), title: z.string() }))
        .handler(({ input }) => ok({ id: input.params.id, title: "Write adapter" })),
    },
  },
});
```

```ts
// src/openapi.ts
import { generateOpenAPISpecFromServerRoutes } from "@alt-stack/server-tanstack-start";
import { Route as listTodosRoute } from "./routes/api/todos";
import { Route as getTodoRoute } from "./routes/api/todos/$id";

export const openApiSpec = generateOpenAPISpecFromServerRoutes(
  [listTodosRoute, getTodoRoute],
  {
    title: "Todos API",
    version: "1.0.0",
  },
);
```

The registry is explicit because TanStack file routes are decentralized modules. `createAltStackFileRoute` attaches the same Alt Stack procedure metadata used by the request handlers to the exported TanStack `Route`, so OpenAPI generation can use those route exports directly.

Handlers receive the native TanStack inputs on `ctx.tanstack`:

```ts
ctx.tanstack.request;
ctx.tanstack.params;
ctx.tanstack.context;
```

For larger APIs, keep each API route as an exported `Route = createAltStackFileRoute(...)` value and compose those exports in registries such as OpenAPI generation, SDK generation, or route-level test setup. Avoid defining separate router paths for TanStack routes; the `createAltStackFileRoute` path is the source of truth for TanStack, Alt Stack, and OpenAPI.
