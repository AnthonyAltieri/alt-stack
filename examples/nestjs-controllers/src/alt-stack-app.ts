import "reflect-metadata";

import { pathToFileURL } from "node:url";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  type NestAppLike,
  TaggedError,
  err,
  init,
  ok,
  registerAltStack,
  router,
} from "@alt-stack/server-nestjs";
import { z } from "zod";
import {
  BodySchema,
  ItemSchema,
  QuerySchema,
  UserSchema,
  UsersService,
} from "./shared.js";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError" as const;

  constructor(message = "missing") {
    super(message);
  }
}

const NotFoundErrorSchema = z.object({
  _tag: z.literal("NotFoundError"),
  message: z.string(),
});

const factory = init();

const apiRouter = router({
  "/users/{id}": factory.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(UserSchema)
    .get(({ ctx, input }) =>
      ok(ctx.nest.get<UsersService>(UsersService).findById(input.params.id)),
    ),

  "/query": factory.procedure
    .input({ query: QuerySchema })
    .output(z.object({ limit: z.number() }))
    .get(({ input }) => ok({ limit: input.query.limit })),

  "/items": factory.procedure
    .input({ body: BodySchema })
    .output(ItemSchema)
    .post(({ input }) =>
      ok({
        id: `item-${input.body.name}`,
        name: input.body.name,
      }),
    ),

  "/error": factory.procedure
    .errors({
      404: NotFoundErrorSchema,
    })
    .get(() => err(new NotFoundError())),
});

@Module({
  providers: [UsersService],
})
class AltStackExampleModule {}

export async function createAltStackApp() {
  const app = await NestFactory.create(AltStackExampleModule, { logger: false });
  app.setGlobalPrefix("v1");
  registerAltStack(app as unknown as NestAppLike, { "/": apiRouter }, { mountPath: "/api" });
  await app.init();
  return app;
}

export async function startAltStackApp(port = Number(process.env.PORT ?? 3002)) {
  const app = await createAltStackApp();
  await app.listen(port);
  console.log(`Alt Stack NestJS example listening on http://localhost:${port}/v1/api`);
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void startAltStackApp();
}
