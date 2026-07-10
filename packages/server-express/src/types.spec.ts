import { describe, it, expectTypeOf } from "vitest";
import type { Request, Response } from "express";
import type { BaseContext } from "@alt-stack/server-core";
import {
  Router,
  combineRouters,
  ok,
  router,
  type RouterRouteSignatures,
} from "./index.js";
import type { ExpressBaseContext } from "./types.js";

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
});
