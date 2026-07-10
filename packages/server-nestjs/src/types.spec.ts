import { describe, expectTypeOf, it } from "vitest";
import type { Request, Response } from "express";
import type { BaseContext } from "@alt-stack/server-core";
import type { ExpressBaseContext } from "@alt-stack/server-express";
import {
  Router,
  combineRouters,
  init,
  ok,
  router,
  type NestBaseContext,
  type NestServiceLocator,
  type RouterRouteSignatures,
} from "./index.js";

describe("Nest Types", () => {
  it("extends the shared base context with express and nest helpers", () => {
    const ctx: NestBaseContext = {
      express: { req: {} as Request, res: {} as Response },
      nest: {
        get: (() => ({})) as NestServiceLocator["get"],
        resolve: (async () => ({})) as NestServiceLocator["resolve"],
      },
    };

    expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    expectTypeOf(ctx).toMatchTypeOf<ExpressBaseContext>();
    expectTypeOf<NestBaseContext>().toHaveProperty("nest");
    expectTypeOf<NestBaseContext["nest"]>().toHaveProperty("get");
    expectTypeOf<NestBaseContext["nest"]>().toHaveProperty("resolve");
  });

  it("keeps ctx.nest available when custom context is merged in", () => {
    const factory = init<{ user: { id: string } | null }>();

    factory.procedure.get(({ ctx }) => {
      expectTypeOf(ctx).toMatchTypeOf<NestBaseContext>();
      expectTypeOf(ctx.nest).toMatchTypeOf<NestServiceLocator>();
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string } | null>();
      return { _tag: "Ok", value: { ok: true as const } };
    });
  });

  it("preserves route metadata through the context-bound factory", () => {
    const factory = init();
    const healthRouter = factory.router({
      "/health": factory.procedure.get(() => ok(undefined)),
    });
    const usersRouter = factory.router({
      "/users": factory.procedure.get(() => ok(undefined)),
    });
    const combined = factory.combineRouters(healthRouter, usersRouter);
    const assertConflict = () => {
      factory.combineRouters(
        // @ts-expect-error - canonical GET /health routes conflict
        healthRouter,
        factory.router({
          "health/": factory.procedure.get(() => ok(undefined)),
        }),
      );
    };
    void assertConflict;

    expectTypeOf<RouterRouteSignatures<typeof combined>>().toEqualTypeOf<
      "GET /health" | "GET /users"
    >();
  });

  it("preserves the Nest router type through the adapter entrypoint", () => {
    const baseRouter = new Router();
    const healthRouter = router({
      "/health": baseRouter.procedure.get(() => ok(undefined)),
    });
    const usersRouter = router({
      "/users": baseRouter.procedure.get(() => ok(undefined)),
    });
    const combined = combineRouters(healthRouter, usersRouter);

    expectTypeOf(combined).toMatchTypeOf<Router>();
    expectTypeOf<RouterRouteSignatures<typeof combined>>().toEqualTypeOf<
      "GET /health" | "GET /users"
    >();
  });
});
