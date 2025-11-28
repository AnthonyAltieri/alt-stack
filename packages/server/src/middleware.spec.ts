import { describe, it, expectTypeOf } from "vitest";
import type { MiddlewareFunction, Overwrite, MiddlewareResult } from "./middleware.js";
import type { TypedContext } from "./types/context.js";

describe("Middleware Types", () => {
  describe("Overwrite", () => {
    it("should overwrite properties in target type", () => {
      type Original = { a: number; b: string; c: boolean };
      type Override = { b: number; c: number };
      type Result = Overwrite<Original, Override>;

      expectTypeOf<Result>().toEqualTypeOf<{
        a: number;
        b: number;
        c: number;
      }>();
    });

    it("should add new properties from override", () => {
      type Original = { a: number };
      type Override = { b: string; c: boolean };
      type Result = Overwrite<Original, Override>;

      expectTypeOf<Result>().toEqualTypeOf<{
        a: number;
        b: string;
        c: boolean;
      }>();
    });

    it("should narrow nullable types", () => {
      type Original = { user: { id: string } | null };
      type Override = { user: { id: string } };
      type Result = Overwrite<Original, Override>;

      expectTypeOf<Result>().toEqualTypeOf<{
        user: { id: string };
      }>();
    });

    it("should handle empty override", () => {
      type Original = { a: number; b: string };
      type Override = {};
      type Result = Overwrite<Original, Override>;

      expectTypeOf<Result>().toEqualTypeOf<{
        a: number;
        b: string;
      }>();
    });

    it("should return original type when override is not an object", () => {
      type Original = { a: number };
      type Override = string;
      type Result = Overwrite<Original, Override>;

      expectTypeOf<Result>().toEqualTypeOf<{ a: number }>();
    });
  });

  describe("MiddlewareResult", () => {
    it("should be context or Response", () => {
      type Result = MiddlewareResult<{ user: string }>;
      
      expectTypeOf<Result>().toMatchTypeOf<{ user: string } | Response>();
    });
  });

  describe("MiddlewareFunction", () => {
    it("should infer context override from next call", () => {
      interface AppContext {
        user: { id: string; email: string } | null;
      }

      // This middleware narrows user to non-null
      const middleware: MiddlewareFunction<
        AppContext,
        { user: { id: string; email: string } }
      > = async (opts) => {
        const { ctx, next } = opts;
        
        if (!ctx.user) {
          throw new Error("Unauthorized");
        }

        // This should infer { user: { id: string; email: string } }
        const result = await next({ ctx: { user: ctx.user } });
        
        if (result instanceof Response) {
          return result;
        }

        // result.user should be narrowed to non-null
        expectTypeOf<typeof result.user>().toEqualTypeOf<{
          id: string;
          email: string;
        }>();

        return result;
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should allow returning Response", () => {
      interface AppContext {
        user: string | null;
      }

      const middleware: MiddlewareFunction<AppContext> = async (opts) => {
        const { ctx } = opts;
        
        if (!ctx.user) {
          return new Response("Unauthorized", { status: 401 });
        }

        return opts.next();
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should support middleware chaining with progressive narrowing", () => {
      interface BaseCtx {
        user: { id: string; role: string } | null;
        session: string | null;
      }

      // First middleware narrows user
      const authMiddleware: MiddlewareFunction<
        BaseCtx,
        { user: { id: string; role: string } }
      > = async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user) {
          throw new Error("unauthorized")
        }
        return next({ ctx: { user: ctx.user } });
      };

      // Second middleware narrows session (assuming user is already narrowed)
      const sessionMiddleware: MiddlewareFunction<
        Overwrite<BaseCtx, { user: { id: string; role: string } }>,
        { session: string }
      > = async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.session) {
          return new Response("No session");
        }
        return next({ ctx: { session: ctx.session } });
      };

      expectTypeOf(authMiddleware).toBeFunction();
      expectTypeOf(sessionMiddleware).toBeFunction();
    });

    it("should infer empty override when next called without args", () => {
      interface AppContext {
        user: string;
      }

      const middleware: MiddlewareFunction<AppContext> = async (opts) => {
        const { next } = opts;
        
        // Calling next() without arguments
        const result = await next();
        
        if (result instanceof Response) {
          return result;
        }

        // result should still be AppContext
        expectTypeOf<typeof result>().toEqualTypeOf<AppContext | Response>();

        return result;
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should handle complex context narrowing", () => {
      interface AppContext {
        user: {
          id: string;
          email: string;
          role: "admin" | "user";
        } | null;
        permissions: string[];
      }

      const middleware: MiddlewareFunction<
        AppContext,
        {
          user: {
            id: string;
            email: string;
            role: "admin";
          };
        }
      > = async (opts) => {
        const { ctx, next } = opts;
        
        if (!ctx.user || ctx.user.role !== "admin") {
          return new Response("Forbidden");
        }

        // Narrow user to admin
        const result = await next({
          ctx: {
            user: ctx.user,
          },
        });

        if (result instanceof Response) {
          return result;
        }

        // User should be narrowed to admin role
        expectTypeOf<typeof result.user.role>().toEqualTypeOf<"admin">();

        return result;
      };

      expectTypeOf(middleware).toBeFunction();
    });

    it("should work with typed context from procedure", () => {
      interface AppContext {
        user: { id: string } | null;
      }

      type Ctx = TypedContext<{}, undefined, AppContext>;

      const middleware: MiddlewareFunction<
        Ctx,
        { user: { id: string } }
      > = async (opts) => {
        const { ctx, next } = opts;
        
        if (!ctx.user) {
          throw new Error("unauthorized")
        }

        const result = await next({ ctx: { user: ctx.user } });

        if (result instanceof Response) {
          return result;
        }

        // result.user should be narrowed
        expectTypeOf<typeof result.user>().toEqualTypeOf<{ id: string }>();
        
        // Other context properties should still be available
        expectTypeOf<typeof result>().toHaveProperty("hono");

        return result;
      };

      expectTypeOf(middleware).toBeFunction();
    });
  });
});

