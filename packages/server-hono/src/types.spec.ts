import { describe, it, expectTypeOf } from "vitest";
import type { Context } from "hono";
import type { cors as honoCors } from "hono/cors";
import type { BaseContext } from "@alt-stack/server-core";
import {
  Router,
  combineRouters,
  ok,
  router,
  type CreateServerOptions,
  type HonoBaseContext,
  type HonoCorsOptions,
  type RouterRouteSignatures,
} from "./index.js";

type NativeHonoCorsOptions = NonNullable<Parameters<typeof honoCors>[0]>;

describe("Hono Types", () => {
  describe("HonoBaseContext", () => {
    it("should extend BaseContext", () => {
      const ctx: HonoBaseContext = { hono: {} as Context };
      expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    });

    it("should have hono property with Hono Context type", () => {
      expectTypeOf<HonoBaseContext>().toHaveProperty("hono");
      expectTypeOf<HonoBaseContext["hono"]>().toMatchTypeOf<Context>();
    });

    it("should be assignable to BaseContext", () => {
      const honoCtx: HonoBaseContext = { hono: {} as Context };
      const baseCtx: BaseContext = honoCtx;
      expectTypeOf(baseCtx).toMatchTypeOf<BaseContext>();
    });

    it("should allow custom properties alongside hono", () => {
      interface AppContext extends HonoBaseContext {
        user: { id: string } | null;
        requestId: string;
      }

      const ctx: AppContext = {
        hono: {} as Context,
        user: { id: "123" },
        requestId: "req-456",
      };

      expectTypeOf(ctx).toMatchTypeOf<HonoBaseContext>();
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string } | null>();
      expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
    });
  });

  it("preserves route metadata through the adapter entrypoint", () => {
    const baseRouter = new Router();
    const healthRouter = router({
      "/health": baseRouter.procedure.get(() => ok(undefined)),
    });
    const usersRouter = router({
      "/users": baseRouter.procedure.get(() => ok(undefined)),
    });
    const combined = combineRouters(healthRouter, usersRouter);
    const assertConflict = () => {
      // @ts-expect-error - canonical GET /health routes conflict
      combineRouters(healthRouter, router({ "health/": baseRouter.procedure.get(() => ok(undefined)) }));
    };
    void assertConflict;

    expectTypeOf<RouterRouteSignatures<typeof combined>>().toEqualTypeOf<
      "GET /health" | "GET /users"
    >();
    expectTypeOf(combined).toMatchTypeOf<Router>();
  });

  describe("CORS options", () => {
    it("should expose Hono's native CORS options without reshaping them", () => {
      expectTypeOf<HonoCorsOptions>().toEqualTypeOf<NativeHonoCorsOptions>();
    });

    it("should allow disabling, enabling defaults, or passing native options", () => {
      expectTypeOf<CreateServerOptions["cors"]>().toEqualTypeOf<
        boolean | NativeHonoCorsOptions | undefined
      >();
    });
  });

  it("should reject framework middleware at the app boundary", () => {
    const options: CreateServerOptions = {
      // @ts-expect-error - use Alt Stack procedure middleware instead
      middleware: {},
    };

    expectTypeOf(options).toEqualTypeOf<CreateServerOptions>();
  });
});
