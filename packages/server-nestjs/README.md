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

## Migration to Bun/Fastify

Keep your route code depending only on the small `ctx.nest.get/resolve` contract. When you move off Nest, provide the same shape from your runtime’s `createContext()`:

```ts
createContext: () => ({
  nest: { get: container.get.bind(container), resolve: container.resolve.bind(container) },
})
```
