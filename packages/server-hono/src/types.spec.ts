import { describe, it, expectTypeOf } from "vitest";
import type { Context } from "hono";
import type { BaseContext } from "@alt-stack/server-core";
import type { HonoBaseContext } from "./types.js";

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
});

