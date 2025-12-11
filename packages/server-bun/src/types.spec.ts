import { describe, it, expect } from "bun:test";
import type { BaseContext } from "@alt-stack/server-core";
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
});
