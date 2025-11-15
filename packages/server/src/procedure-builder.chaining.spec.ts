import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import { BaseProcedureBuilder } from "./procedure-builder.js";

describe("Middleware Context Chaining", () => {
  it("should preserve narrowed context through .errors() and subsequent .use()", () => {
    interface AppContext {
      user: { id: string; email: string; role: "admin" | "user" } | null;
    }

    const builder = new BaseProcedureBuilder<
      {},
      undefined,
      undefined,
      AppContext
    >();

    // Step 1: Add errors
    const withErrors = builder.errors({
      401: z.object({
        error: z.object({
          code: z.literal("UNAUTHORIZED"),
          message: z.string(),
        }),
      }),
    });

    // Step 2: Add middleware that narrows user to non-null
    const protectedProcedure = withErrors.use(async (opts) => {
      const { ctx, next } = opts;
      if (!ctx.user) {
        throw new Error("Unauthorized");
      }
      // This should narrow user to non-null
      return next({ ctx: { user: ctx.user } });
    });

    // Verify context is narrowed after first middleware
    type ProtectedContext =
      typeof protectedProcedure extends BaseProcedureBuilder<
        infer _I,
        infer _O,
        infer _E,
        infer C,
        infer _R
      >
        ? C
        : never;

    expectTypeOf<ProtectedContext["user"]>().toEqualTypeOf<{
      id: string;
      email: string;
      role: "admin" | "user";
    }>();

    // Step 3: Add more errors (should preserve narrowed context)
    const withMoreErrors = protectedProcedure.errors({
      403: z.object({
        error: z.object({
          code: z.literal("FORBIDDEN"),
          message: z.string(),
        }),
      }),
    });

    // Verify context is still narrowed after adding errors
    type AfterMoreErrors =
      typeof withMoreErrors extends BaseProcedureBuilder<
        infer _I,
        infer _O,
        infer _E,
        infer C,
        infer _R
      >
        ? C
        : never;

    expectTypeOf<AfterMoreErrors["user"]>().toEqualTypeOf<{
      id: string;
      email: string;
      role: "admin" | "user";
    }>();

    // Step 4: Add another middleware (context should still be narrowed)
    const adminProcedure = withMoreErrors.use(async (opts) => {
      const { ctx, next } = opts;

      // THIS IS THE KEY TEST: ctx.user should be non-null here
      // because protectedProcedure already narrowed it
      expectTypeOf<typeof ctx.user>().toEqualTypeOf<{
        id: string;
        email: string;
        role: "admin" | "user";
      }>();

      // ctx.user should NOT be nullable
      expectTypeOf<typeof ctx.user>().not.toEqualTypeOf<{
        id: string;
        email: string;
        role: "admin" | "user";
      } | null>();

      if (ctx.user.role !== "admin") {
        // This should not error because ctx.user is guaranteed non-null
        throw new Error("Forbidden");
      }
      return next();
    });

    // Verify final context
    type AdminContext =
      typeof adminProcedure extends BaseProcedureBuilder<
        infer _I,
        infer _O,
        infer _E,
        infer C,
        infer _R
      >
        ? C
        : never;

    expectTypeOf<AdminContext["user"]>().toEqualTypeOf<{
      id: string;
      email: string;
      role: "admin" | "user";
    }>();
  });

  it("should narrow context through multiple middleware calls", () => {
    interface AppContext {
      user: { id: string; role: string } | null;
      session: string | null;
      tenant: string | null;
    }

    const builder = new BaseProcedureBuilder<
      {},
      undefined,
      undefined,
      AppContext
    >();

    const withUser = builder.use(async (opts) => {
      if (!opts.ctx.user) {
        throw new Error("No user");
      }
      return opts.next({ ctx: { user: opts.ctx.user } });
    });

    const withSession = withUser.use(async (opts) => {
      // user should already be narrowed here
      expectTypeOf<typeof opts.ctx.user>().toEqualTypeOf<{
        id: string;
        role: string;
      }>();

      if (!opts.ctx.session) {
        throw new Error("No session");
      }
      return opts.next({ ctx: { session: opts.ctx.session } });
    });

    const withTenant = withSession.use(async (opts) => {
      // user and session should both be narrowed here
      expectTypeOf<typeof opts.ctx.user>().toEqualTypeOf<{
        id: string;
        role: string;
      }>();
      expectTypeOf<typeof opts.ctx.session>().toEqualTypeOf<string>();

      if (!opts.ctx.tenant) {
        throw new Error("No tenant");
      }
      return opts.next({ ctx: { tenant: opts.ctx.tenant } });
    });

    type FinalContext =
      typeof withTenant extends BaseProcedureBuilder<
        infer _I,
        infer _O,
        infer _E,
        infer C,
        infer _R
      >
        ? C
        : never;

    expectTypeOf<FinalContext>().toEqualTypeOf<{
      user: { id: string; role: string };
      session: string;
      tenant: string;
    }>();
  });
});
