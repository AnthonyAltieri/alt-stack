# @alt-stack/server-nestjs

Run Alt Stack routers inside a NestJS app (Express platform), while still using Nest DI in handlers via `ctx.nest.get()` / `ctx.nest.resolve()`.

## Install

```bash
pnpm add @alt-stack/server-nestjs @nestjs/common @nestjs/core @nestjs/platform-express express zod
```

## Quick start (main.ts)

```ts
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { registerAltStack } from "@alt-stack/server-nestjs";
import { apiRouter } from "./api.router";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  registerAltStack(app, { api: apiRouter }, { mountPath: "/api" });

  await app.listen(3000);
}

bootstrap();
```

## Defining routes (Alt Stack) with Nest DI

```ts
import { init, router } from "@alt-stack/server-nestjs";
import { z } from "zod";
import { UsersService } from "./users.service";

const factory = init();

export const apiRouter = router({
  "/users/{id}": factory.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .get(async ({ ctx, input }) => {
      const users = ctx.nest.get(UsersService);
      return users.findById(input.params.id);
    }),
});
```

## Nest middleware (Alt Stack middleware)

You can also author Nest (Express) middleware using Alt Stack middleware builders. Context overrides are stored on the request and merged into `ctx` for Alt Stack handlers in the same request.

```ts
import { createNestMiddleware, createMiddlewareWithErrors, err, TaggedError } from "@alt-stack/server-nestjs";
import { z } from "zod";
import { AuthService } from "./auth.service";

class UnauthorizedError extends TaggedError {
  readonly _tag = "UnauthorizedError" as const;
  constructor(message = "Unauthorized") {
    super(message);
  }
}

const authMiddleware = createMiddlewareWithErrors<any>()
  .errors({ 401: z.object({ _tag: z.literal("UnauthorizedError") }) })
  .fn(async ({ ctx, next }) => {
    const token = ctx.express.req.headers.authorization;
    if (!token) return err(new UnauthorizedError());

    const auth = ctx.nest.get(AuthService);
    const user = await auth.verify(token);

    return next({ ctx: { user } });
  });

// In main.ts, before `registerAltStack(...)`:
app.use(createNestMiddleware(app, authMiddleware));
```

Note: since this runs outside Alt Stack’s procedure builder, TypeScript can’t automatically narrow the handler context. Model any injected fields (like `user`) in your `init<TCustomContext>()` type.

## Migration to Bun/Fastify

Keep your route code depending only on the small `ctx.nest.get/resolve` contract. When you move off Nest, provide the same shape from your runtime’s `createContext()`:

```ts
createContext: () => ({
  nest: { get: container.get.bind(container), resolve: container.resolve.bind(container) },
})
```
