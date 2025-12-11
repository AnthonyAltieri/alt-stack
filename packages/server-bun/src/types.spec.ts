import { describe, it, expectTypeOf } from "vitest";
import type { BaseContext } from "@alt-stack/server-core";
import type { BunBaseContext, BunServer } from "./types.js";

describe("Bun Types", () => {
  describe("BunBaseContext", () => {
    it("should extend BaseContext", () => {
      const ctx: BunBaseContext = {
        bun: { req: {} as Request, server: {} as BunServer },
      };
      expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    });

    it("should have bun property with req and server", () => {
      expectTypeOf<BunBaseContext>().toHaveProperty("bun");
      expectTypeOf<BunBaseContext["bun"]["req"]>().toMatchTypeOf<Request>();
      expectTypeOf<BunBaseContext["bun"]["server"]>().toMatchTypeOf<BunServer>();
    });

    it("should be assignable to BaseContext", () => {
      const bunCtx: BunBaseContext = {
        bun: { req: {} as Request, server: {} as BunServer },
      };
      const baseCtx: BaseContext = bunCtx;
      expectTypeOf(baseCtx).toMatchTypeOf<BaseContext>();
    });

    it("should allow custom properties alongside bun", () => {
      interface AppContext extends BunBaseContext {
        user: { id: string } | null;
        requestId: string;
      }

      const ctx: AppContext = {
        bun: { req: {} as Request, server: {} as BunServer },
        user: { id: "123" },
        requestId: "req-456",
      };

      expectTypeOf(ctx).toMatchTypeOf<BunBaseContext>();
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string } | null>();
      expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
    });
  });
});
