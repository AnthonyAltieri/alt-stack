# @alt-stack/server-tanstack-start

TanStack Start server route adapter for Alt Stack.

Use it when you want TanStack Start and TanStack Router files to stay idiomatic, while defining request validation, output validation, typed errors, middleware, and handlers with Alt Stack.

```ts
// src/routes/api/todos/$id.ts
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createServerRoute,
  init,
  ok,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

export const Route = createFileRoute("/api/todos/$id")({
  server: createServerRoute("/api/todos/$id", {
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
  }),
});
```

The helper returns TanStack's `server: { handlers }` shape. The route path uses TanStack's `$id` syntax, and the adapter converts it to Alt Stack's `{id}` path syntax internally.

For larger APIs, define regular Alt Stack routers and expose them to TanStack:

```ts
import { createFileRoute } from "@tanstack/react-router";
import {
  createRouteHandlers,
  init,
  ok,
  router,
  type TanStackBaseContext,
} from "@alt-stack/server-tanstack-start";
import { z } from "zod";

interface AppContext extends TanStackBaseContext {
  user: { id: string } | null;
}

const t = init<AppContext>();

const todosRouter = router<AppContext>({
  "/api/todos/{id}": {
    get: t.procedure
      .input({ params: z.object({ id: z.string() }) })
      .output(z.object({ id: z.string() }))
      .handler(({ input }) => ok({ id: input.params.id })),
  },
});

export const Route = createFileRoute("/api/todos/$id")({
  server: createRouteHandlers(todosRouter),
});
```

Handlers receive the native TanStack inputs on `ctx.tanstack`:

```ts
ctx.tanstack.request;
ctx.tanstack.params;
ctx.tanstack.context;
```
