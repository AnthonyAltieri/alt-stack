import { describe, it, expectTypeOf, vi } from "vitest";
import { z } from "zod";
import { BaseProcedureBuilder } from "./procedure-builder.js";
import { ok } from "@alt-stack/result";
import type { HasTagLiteral, ValidateErrorConfig } from "./types/index.js";

describe("ProcedureBuilder", () => {
  describe("BaseProcedureBuilder.use", () => {
    it("should infer context override from middleware implementation", () => {
      interface AppContext {
        user: { id: string; email: string } | null;
      }

      const builder = new BaseProcedureBuilder<
        {},
        undefined,
        undefined,
        AppContext
      >();

      // Middleware that narrows user to non-null
      const narrowedBuilder = builder.use(async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user) {
          throw new Error("unauthorized");
        }
        // TypeScript should infer { user: { id: string; email: string } } from this
        return next({ ctx: { user: ctx.user } });
      });

      // The builder should now have narrowed context
      // We can verify this by checking the type
      type NarrowedContext =
        typeof narrowedBuilder extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer _E,
          infer C,
          infer _R
        >
          ? C
          : never;

      expectTypeOf<NarrowedContext>().toMatchTypeOf<{
        user: { id: string; email: string };
      }>();
    });

    it("should chain multiple middleware with progressive narrowing", () => {
      interface AppContext {
        user: { id: string; role: string } | null;
        session: string | null;
      }

      const builder = new BaseProcedureBuilder<
        {},
        undefined,
        undefined,
        AppContext
      >();

      const withUser = builder.use(async (opts) => {
        if (!opts.ctx.user) {
          throw new Error("unauthorized");
        }
        return opts.next({ ctx: { user: opts.ctx.user } });
      });

      const withSession = withUser.use(async (opts) => {
        if (!opts.ctx.session) {
          throw new Error("No session");
        }
        return opts.next({ ctx: { session: opts.ctx.session } });
      });

      type FinalContext =
        typeof withSession extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer _E,
          infer C,
          infer _R
        >
          ? C
          : never;

      expectTypeOf<FinalContext>().toMatchTypeOf<{
        user: { id: string; role: string };
        session: string;
      }>();
    });

    it("should narrow specific property types", () => {
      interface AppContext {
        user: {
          id: string;
          email: string;
          role: "admin" | "user";
        } | null;
      }

      const builder = new BaseProcedureBuilder<
        {},
        undefined,
        undefined,
        AppContext
      >();

      const adminOnly = builder.use(async (opts) => {
        const { ctx, next } = opts;
        if (!ctx.user || ctx.user.role !== "admin") {
          throw new Error("Forbidden");
        }
        // Narrow both user to non-null AND role to "admin"
        return next({ ctx: { user: ctx.user } });
      });

      type AdminContext =
        typeof adminOnly extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer _E,
          infer C,
          infer _R
        >
          ? C
          : never;

      expectTypeOf<AdminContext["user"]>().toMatchTypeOf<{
        id: string;
        email: string;
        role: "admin" | "user";
      }>();
      expectTypeOf<AdminContext["user"]>().not.toEqualTypeOf<{
        id: string;
        email: string;
        role: "admin" | "user";
      } | null>();
    });

    it("should work when next called without arguments", () => {
      interface AppContext {
        timestamp: number;
      }

      const builder = new BaseProcedureBuilder<
        {},
        undefined,
        undefined,
        AppContext
      >();

      const withTimestamp = builder.use(async (opts) => {
        const { next } = opts;
        // Call next without narrowing
        return next();
      });

      type Context =
        typeof withTimestamp extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer _E,
          infer C,
          infer _R
        >
          ? C
          : never;

      expectTypeOf<Context>().toMatchTypeOf<AppContext>();
    });
  });

  describe("BaseProcedureBuilder.errors", () => {
    it("should set error config with _tag literal", () => {
      const builder = new BaseProcedureBuilder();

      const withErrors = builder.errors({
        404: z.object({
          _tag: z.literal("NotFoundError"),
          message: z.string(),
        }),
      });

      type Errors =
        typeof withErrors extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer E,
          infer _C,
          infer _R
        >
          ? E
          : never;

      expectTypeOf<Errors>().toMatchTypeOf<{
        404: z.ZodObject<{
          _tag: z.ZodLiteral<"NotFoundError">;
          message: z.ZodString;
        }>;
      }>();
    });

    it("should reject schemas without _tag field (HasTagLiteral returns never)", () => {
      // Schema without _tag should resolve to never
      type SchemaWithoutTag = z.ZodObject<{ message: z.ZodString }>;
      expectTypeOf<HasTagLiteral<SchemaWithoutTag>>().toEqualTypeOf<never>();
    });

    it("should reject schemas with non-literal _tag (HasTagLiteral returns never)", () => {
      // Schema with _tag: z.string() (not literal) should resolve to never
      type SchemaWithStringTag = z.ZodObject<{
        _tag: z.ZodString;
        message: z.ZodString;
      }>;
      expectTypeOf<HasTagLiteral<SchemaWithStringTag>>().toEqualTypeOf<never>();
    });

    it("should accept schemas with _tag literal (HasTagLiteral returns the schema)", () => {
      // Schema with _tag: z.literal("...") should return the schema type
      type SchemaWithLiteralTag = z.ZodObject<{
        _tag: z.ZodLiteral<"NotFoundError">;
        message: z.ZodString;
      }>;
      expectTypeOf<HasTagLiteral<SchemaWithLiteralTag>>().toEqualTypeOf<SchemaWithLiteralTag>();
    });

    it("should validate entire error config with ValidateErrorConfig", () => {
      // Valid config - all schemas have _tag literals
      type ValidConfig = {
        404: z.ZodObject<{ _tag: z.ZodLiteral<"NotFoundError">; message: z.ZodString }>;
        401: z.ZodObject<{ _tag: z.ZodLiteral<"UnauthorizedError">; message: z.ZodString }>;
      };
      type ValidatedConfig = ValidateErrorConfig<ValidConfig>;

      // Should preserve the original types
      expectTypeOf<ValidatedConfig[404]>().toEqualTypeOf<ValidConfig[404]>();
      expectTypeOf<ValidatedConfig[401]>().toEqualTypeOf<ValidConfig[401]>();
    });

    it("should return never for invalid schemas in ValidateErrorConfig", () => {
      // Invalid config - schema without _tag
      type InvalidConfig = {
        404: z.ZodObject<{ message: z.ZodString }>;
      };
      type ValidatedConfig = ValidateErrorConfig<InvalidConfig>;

      // Should be never because the schema is invalid
      expectTypeOf<ValidatedConfig[404]>().toEqualTypeOf<never>();
    });

    it("should return never for mixed valid/invalid schemas", () => {
      // Mixed config - one valid, one invalid
      type MixedConfig = {
        404: z.ZodObject<{ _tag: z.ZodLiteral<"NotFoundError">; message: z.ZodString }>;
        500: z.ZodObject<{ message: z.ZodString }>; // Invalid - no _tag
      };
      type ValidatedConfig = ValidateErrorConfig<MixedConfig>;

      // Valid schema should pass through
      expectTypeOf<ValidatedConfig[404]>().toEqualTypeOf<MixedConfig[404]>();
      // Invalid schema should be never
      expectTypeOf<ValidatedConfig[500]>().toEqualTypeOf<never>();
    });
  });

  describe("BaseProcedureBuilder.input", () => {
    it("should set input config with params and query", () => {
      const builder = new BaseProcedureBuilder();

      const withInput = builder.input({
        params: z.object({ id: z.string() }),
        query: z.object({ page: z.coerce.number() }),
      });

      type Input =
        typeof withInput extends BaseProcedureBuilder<
          infer I,
          infer _O,
          infer _E,
          infer _C,
          infer _R
        >
          ? I
          : never;

      // Check that params is set correctly - we verify the shape exists
      expectTypeOf<Input>().toHaveProperty("params");
      expectTypeOf<Input>().toHaveProperty("query");
    });
  });

  describe("BaseProcedureBuilder.output", () => {
    it("should set output schema", () => {
      const builder = new BaseProcedureBuilder();

      const withOutput = builder.output(
        z.object({
          name: z.string(),
          age: z.number(),
        }),
      );

      type Output =
        typeof withOutput extends BaseProcedureBuilder<
          infer _I,
          infer O,
          infer _E,
          infer _C,
          infer _R
        >
          ? O
          : never;

      expectTypeOf<Output>().toMatchTypeOf<
        z.ZodObject<{
          name: z.ZodString;
          age: z.ZodNumber;
        }>
      >();
    });
  });

  describe("Complete procedure building flow", () => {
    it("should build a complete procedure with narrowed context", () => {
      interface AppContext {
        user: { id: string; email: string; role: "admin" | "user" } | null;
      }

      // Create a mock router
      const mockRouter = {
        register: vi.fn(),
      };

      const factory = {
        procedure: new BaseProcedureBuilder<
          {},
          undefined,
          undefined,
          AppContext,
          typeof mockRouter
        >(undefined, undefined, mockRouter),
      };

      // Create protected procedure that narrows user
      const protectedProcedure = factory.procedure
        .errors({
          401: z.object({
            _tag: z.literal("UnauthorizedError"),
            message: z.string(),
          }),
        })
        .use(async (opts) => {
          const { ctx, next } = opts;
          if (!ctx.user) {
            throw new Error("Unauthorized");
          }
          // This narrows user to non-null
          return next({ ctx: { user: ctx.user } });
        });

      // Verify the context is narrowed in the procedure
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

      // The narrowed context should not be nullable
      expectTypeOf<ProtectedContext["user"]>().not.toEqualTypeOf<{
        id: string;
        email: string;
        role: "admin" | "user";
      } | null>();
    });

    it("should preserve narrowed context through get/post/etc methods", () => {
      interface AppContext {
        user: { id: string } | null;
      }

      const mockRouter = {
        register: vi.fn(),
      };

      const builder = new BaseProcedureBuilder<
        {},
        undefined,
        undefined,
        AppContext,
        typeof mockRouter
      >(undefined, undefined, mockRouter);

      const protectedBuilder = builder.use(async (opts) => {
        if (!opts.ctx.user) {
          throw new Error("unauthorized");
        }
        return opts.next({ ctx: { user: opts.ctx.user } });
      });

      const readyProcedure = protectedBuilder
        .output(z.object({ id: z.string() }))
        .get(({ ctx }) => ok({
          id: ctx.user.id,
        }));

      type HandlerContext = Parameters<
        (typeof readyProcedure)["handler"]
      >[0]["ctx"];

      expectTypeOf<HandlerContext["user"]>().toMatchTypeOf<{
        id: string;
      }>();
    });
  });

  describe("Real-world example from index.ts", () => {
    it("should match the pattern used in the example", () => {
      interface User {
        id: string;
        email: string;
        name: string;
      }

      interface AppContext {
        user: User | null;
      }

      const mockRouter = {
        register: vi.fn(),
      };

      const factory = {
        procedure: new BaseProcedureBuilder<
          {},
          undefined,
          undefined,
          AppContext,
          typeof mockRouter
        >(undefined, undefined, mockRouter),
      };

      const protectedProcedure = factory.procedure
        .errors({
          401: z.object({
            _tag: z.literal("UnauthorizedError"),
            message: z.string(),
          }),
        })
        .use(async (opts) => {
          const { ctx, next } = opts;
          if (!ctx.user) {
            throw new Error("Unauthorized");
          }
          // Pass user through next - TypeScript should infer the narrowing
          return next({ ctx: { user: ctx.user } });
        });

      // Test that the context is properly narrowed
      type NarrowedContext =
        typeof protectedProcedure extends BaseProcedureBuilder<
          infer _I,
          infer _O,
          infer _E,
          infer C,
          infer _R
        >
          ? C
          : never;

      // user should be narrowed from User | null to User
      expectTypeOf<NarrowedContext["user"]>().toEqualTypeOf<User>();
      expectTypeOf<NarrowedContext["user"]>().not.toEqualTypeOf<User | null>();
    });
  });
});
