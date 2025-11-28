import { describe, it, expectTypeOf } from "vitest";
import type { Middleware, Overwrite, MiddlewareResult } from "./middleware.js";
import type { BaseContext, TypedContext } from "./types/context.js";

describe("Middleware Types", () => {
  describe("Overwrite", () => {
    it("should overwrite properties in target type", () => {
      type Original = { a: number; b: string; c: boolean };
      type Override = { b: number; c: number };
      type Result = Overwrite<Original, Override>;

      // Use a variable to satisfy vitest's expectTypeOf
      const _result: Result = { a: 1, b: 2, c: 3 };
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: number; c: number }>();
    });

    it("should add new properties from override", () => {
      type Original = { a: number };
      type Override = { b: string; c: boolean };
      type Result = Overwrite<Original, Override>;

      const _result: Result = { a: 1, b: "x", c: true };
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: string; c: boolean }>();
    });

    it("should narrow nullable types", () => {
      type Original = { user: { id: string } | null };
      type Override = { user: { id: string } };
      type Result = Overwrite<Original, Override>;

      const _result: Result = { user: { id: "1" } };
      expectTypeOf(_result).toMatchTypeOf<{ user: { id: string } }>();
    });

    it("should handle empty override", () => {
      type Original = { a: number; b: string };
      // Empty object type
      type Override = object;
      type Result = Overwrite<Original, Override>;

      // With an empty object override, the original type is preserved
      const _result = { a: 1, b: "x" } as Result;
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: string }>();
    });

    it("should return original type when override is not an object", () => {
      type Original = { a: number };
      type Override = string;
      type Result = Overwrite<Original, Override>;

      const _result: Result = { a: 1 };
      expectTypeOf(_result).toMatchTypeOf<{ a: number }>();
    });
  });

  describe("MiddlewareResult", () => {
    it("should have marker, ok, and data properties", () => {
      type Result = MiddlewareResult<{ user: string }>;

      expectTypeOf<Result>().toHaveProperty("marker");
      expectTypeOf<Result>().toHaveProperty("ok");
      expectTypeOf<Result>().toHaveProperty("data");
    });
  });

  describe("Middleware (legacy type)", () => {
    it("should accept valid middleware function", () => {
      interface AppContext extends BaseContext {
        user: { id: string; email: string } | null;
      }

      const middleware: Middleware<AppContext, AppContext> = async (opts) => {
        const { ctx, next } = opts;

        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        return next();
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should allow returning Response", () => {
      interface AppContext extends BaseContext {
        user: string | null;
      }

      const middleware: Middleware<AppContext> = async (opts) => {
        const { ctx } = opts;

        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        return opts.next();
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should support context extension via next", () => {
      interface BaseCtx extends BaseContext {
        user: { id: string; role: string } | null;
      }

      interface AuthedCtx extends BaseContext {
        user: { id: string; role: string };
      }

      const authMiddleware: Middleware<BaseCtx, AuthedCtx> = async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }
        return next({ ctx: { user: ctx.user } });
      };

      expectTypeOf(authMiddleware).toBeFunction();
    });

    it("should infer types when next called without args", () => {
      interface AppContext extends BaseContext {
        user: string;
      }

      const middleware: Middleware<AppContext> = async (opts) => {
        const { next } = opts;
        return next();
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should work with typed context from procedure", () => {
      interface AppContext {
        user: { id: string } | null;
      }

      type Ctx = TypedContext<{}, undefined, AppContext> & BaseContext;

      const middleware: Middleware<Ctx, Ctx> = async (opts) => {
        const { ctx, next } = opts;

        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        return next({ ctx: { user: ctx.user } });
      };

      expectTypeOf(middleware).toBeFunction();
    });
  });
});
