import { describe, it, expect } from "bun:test";
import type { BaseContext } from "@alt-stack/server-core";
import {
  Router,
  combineRouters,
  ok,
  router,
  type RouterRouteSignatures,
} from "./index.ts";
import type { BunBaseContext, BunServer } from "./types.ts";

describe("Bun Types", () => {
  describe("BunBaseContext", () => {
    it("should extend BaseContext", () => {
      // Type-level test: BunBaseContext should be assignable to BaseContext
      const ctx: BunBaseContext = {
        bun: { req: new Request("http://localhost"), server: {} as BunServer },
      };
      const _baseCtx: BaseContext = ctx;
      expect(ctx.bun).toBeDefined();
    });

    it("should have bun property with req and server", () => {
      const ctx: BunBaseContext = {
        bun: { req: new Request("http://localhost"), server: {} as BunServer },
      };
      expect(ctx.bun.req).toBeInstanceOf(Request);
      expect(ctx.bun.server).toBeDefined();
    });

    it("should allow custom properties alongside bun", () => {
      interface AppContext extends BunBaseContext {
        user: { id: string } | null;
        requestId: string;
      }

      const ctx: AppContext = {
        bun: { req: new Request("http://localhost"), server: {} as BunServer },
        user: { id: "123" },
        requestId: "req-456",
      };

      expect(ctx.user?.id).toBe("123");
      expect(ctx.requestId).toBe("req-456");
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

    const signature: RouterRouteSignatures<typeof combined> = "GET /health";
    const adapterRouter: Router = combined;
    expect(signature).toBe("GET /health");
    expect(adapterRouter.getProcedures()).toHaveLength(2);
  });
});
