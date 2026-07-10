import { describe, it, expectTypeOf } from "vitest";
import type { Request, Response } from "express";
import type expressCors from "cors";
import type { BaseContext } from "@alt-stack/server-core";
import {
  Router,
  combineRouters,
  ok,
  router,
  type createServer,
  type ExpressCorsOptions,
  type RouterRouteSignatures,
} from "./index.js";
import type { ExpressBaseContext } from "./types.js";

type NativeExpressCorsOptions = NonNullable<
  Parameters<typeof expressCors>[0]
>;
type CreateServerOptions = NonNullable<Parameters<typeof createServer>[1]>;

describe("Express Types", () => {
  describe("ExpressBaseContext", () => {
    it("should extend BaseContext", () => {
      const ctx: ExpressBaseContext = {
        express: { req: {} as Request, res: {} as Response },
      };
      expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    });

    it("should have express property with req and res", () => {
      expectTypeOf<ExpressBaseContext>().toHaveProperty("express");
      expectTypeOf<ExpressBaseContext["express"]>().toHaveProperty("req");
      expectTypeOf<ExpressBaseContext["express"]>().toHaveProperty("res");
      expectTypeOf<ExpressBaseContext["express"]["req"]>().toMatchTypeOf<Request>();
      expectTypeOf<ExpressBaseContext["express"]["res"]>().toMatchTypeOf<Response>();
    });

    it("should be assignable to BaseContext", () => {
      const expressCtx: ExpressBaseContext = {
        express: { req: {} as Request, res: {} as Response },
      };
      const baseCtx: BaseContext = expressCtx;
      expectTypeOf(baseCtx).toMatchTypeOf<BaseContext>();
    });

    it("should allow custom properties alongside express", () => {
      interface AppContext extends ExpressBaseContext {
        user: { id: string } | null;
        requestId: string;
      }

      const ctx: AppContext = {
        express: { req: {} as Request, res: {} as Response },
        user: { id: "123" },
        requestId: "req-456",
      };

      expectTypeOf(ctx).toMatchTypeOf<ExpressBaseContext>();
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

  describe("CORS", () => {
    it("should expose the native cors middleware options", () => {
      expectTypeOf<ExpressCorsOptions>().toEqualTypeOf<NativeExpressCorsOptions>();
    });

    it("should accept boolean or native cors options", () => {
      expectTypeOf<CreateServerOptions["cors"]>().toEqualTypeOf<
        boolean | ExpressCorsOptions | undefined
      >();
    });

    it("should accept native static and delegated options", () => {
      const staticOptions = {
        origin: "https://client.example.com",
        credentials: true,
      } satisfies ExpressCorsOptions;
      const delegatedOptions = ((_req, callback) => {
        callback(null, { origin: true });
      }) satisfies ExpressCorsOptions;

      expectTypeOf(staticOptions).toMatchTypeOf<ExpressCorsOptions>();
      expectTypeOf(delegatedOptions).toMatchTypeOf<ExpressCorsOptions>();
    });
  });
});
