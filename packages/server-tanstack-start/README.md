# @alt-stack/server-tanstack-start

TanStack Start server route adapter for Alt Stack.

Use it when you want TanStack Start and TanStack Router files to stay idiomatic, while defining request validation, output validation, typed errors, middleware, and handlers with Alt Stack.

```ts
// src/routes/api/todos/$id.ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  defineServerRoute,
  init,
  ok,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const todosRoute = defineServerRoute("/api/todos/$id", {
  get: t.procedure
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
});

export const Route = createFileRoute(todosRoute.path)({
  server: todosRoute.server,
});
```

`defineServerRoute` returns `{ path, server, router }`, so the TanStack route path is defined once and reused by `createFileRoute`. The route path uses TanStack's `$id` syntax, and the adapter converts it to Alt Stack's `{id}` path syntax internally.

## OpenAPI

Export each `defineServerRoute` object from its route module, then collect those exports in one OpenAPI registry file.

```ts
// src/routes/api/todos/index.ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { defineServerRoute, init, ok, type TanStackBaseContext } from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const listTodosRoute = defineServerRoute("/api/todos", {
  get: t.procedure
    .output(z.array(z.object({ id: z.string(), title: z.string() })))
    .handler(() => ok([])),
});

export const Route = createFileRoute(listTodosRoute.path)({
  server: listTodosRoute.server,
});
```

```ts
// src/routes/api/todos/$id.ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { defineServerRoute, init, ok, type TanStackBaseContext } from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const getTodoRoute = defineServerRoute("/api/todos/$id", {
  get: t.procedure
    .input({ params: z.object({ id: z.string().uuid() }) })
    .output(z.object({ id: z.string(), title: z.string() }))
    .handler(({ input }) => ok({ id: input.params.id, title: "Write adapter" })),
});

export const Route = createFileRoute(getTodoRoute.path)({
  server: getTodoRoute.server,
});
```

```ts
// src/openapi.ts
import { generateOpenAPISpecFromServerRoutes } from "@alt-stack/server-tanstack-start";
import { listTodosRoute } from "./routes/api/todos";
import { getTodoRoute } from "./routes/api/todos/$id";

export const openApiSpec = generateOpenAPISpecFromServerRoutes(
  [listTodosRoute, getTodoRoute],
  {
    title: "Todos API",
    version: "1.0.0",
  },
);
```

The registry is explicit because TanStack file routes are decentralized modules. Keeping the `defineServerRoute` object exported from each route file gives OpenAPI generation the same Alt Stack procedure metadata used by the request handlers.

Handlers receive the native TanStack inputs on `ctx.tanstack`:

```ts
ctx.tanstack.request;
ctx.tanstack.params;
ctx.tanstack.context;
```

For larger APIs, keep each API route as an exported `defineServerRoute` value and compose those exports in registries such as OpenAPI generation, SDK generation, or route-level test setup. Avoid defining separate router paths for TanStack routes; the `defineServerRoute` path is the source of truth for TanStack, Alt Stack, and OpenAPI.
