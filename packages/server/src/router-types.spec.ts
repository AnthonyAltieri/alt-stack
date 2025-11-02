import { z } from "zod";
import type { createRouter } from "./router.js";

/**
 * Positive Type Tests - Tests that verify valid configurations compile correctly
 *
 * For tests that verify constraints ERROR when they should, see:
 * - router-types.negative.spec.ts - Uses @ts-expect-error to test constraint violations
 *
 * To verify negative tests:
 * 1. Run `pnpm check-types` - should pass (errors are expected and marked)
 * 2. Remove @ts-expect-error from negative tests - type errors should occur
 * 3. Fix the code - type errors should disappear
 */

// Type testing utilities
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2
    ? true
    : false;

type Expect<T extends true> = T;

// Test that valid router configuration compiles
// Verify that createRouter returns an object with a get method
type TestValidRouterConfig = Expect<
  Equal<
    ReturnType<typeof createRouter> extends {
      get: any;
    }
      ? true
      : false,
    true
  >
>;

// Test that path params must be in params schema (should compile)
const testValidPathParams = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      input: {
        params: z.object({
          id: z.string(),
        }),
      },
      output: z.object({ id: z.string() }),
    })
    .handler((ctx) => {
      // ctx.input.id should be string
      const id: string = ctx.input.id;
      return { id };
    });
};

// Test that missing path param causes error (should NOT compile)
// Uncomment to verify type error:
// const testMissingPathParam = <T extends typeof createRouter>(router: T) => {
//   router()
//     .get("/users/{id}" as const, {
//       input: {
//         params: z.object({
//           name: z.string(), // Missing 'id' - should cause type error
//         }),
//       },
//       output: z.object({ id: z.string() }),
//     })
//     .handler((ctx) => {
//       return { id: ctx.input.name };
//     });
// };

// Test that params with string schema works
const testParamsWithString = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      input: {
        params: z.object({
          id: z.string(), // ✅ Valid - accepts string
        }),
      },
      output: z.object({ id: z.string() }),
    })
    .handler((ctx) => {
      return { id: ctx.input.id };
    });
};

// Test that params with coerce works
const testParamsWithCoerce = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      input: {
        params: z.object({
          id: z.coerce.number(), // ✅ Valid - accepts string (coerces to number)
        }),
      },
      output: z.object({ id: z.number() }),
    })
    .handler((ctx) => {
      const id: number = ctx.input.id;
      return { id };
    });
};

// Test that query with string schema works
const testQueryWithString = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users" as const, {
      input: {
        query: z.object({
          limit: z.string(), // ✅ Valid - accepts string
        }),
      },
      output: z.object({ limit: z.string() }),
    })
    .handler((ctx) => {
      const limit: string = ctx.input.limit;
      return { limit };
    });
};

// Test that query with coerce works
const testQueryWithCoerce = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users" as const, {
      input: {
        query: z.object({
          limit: z.coerce.number(), // ✅ Valid - accepts string
        }),
      },
      output: z.object({ limit: z.number() }),
    })
    .handler((ctx) => {
      const limit: number = ctx.input.limit;
      return { limit };
    });
};

// Test that body doesn't need string constraint
const testBodyWithNumber = <T extends typeof createRouter>(router: T) => {
  router()
    .post("/users" as const, {
      input: {
        body: z.object({
          age: z.number(), // ✅ Valid - body doesn't need string constraint
        }),
      },
      output: z.object({ age: z.number() }),
    })
    .handler((ctx) => {
      const age: number = ctx.input.age;
      return { age };
    });
};

// Test error throwing with correct error type
const testErrorThrowing = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      input: {
        params: z.object({
          id: z.string(),
        }),
      },
      output: z.object({ id: z.string() }),
      errors: {
        404: z.object({
          error: z.object({
            code: z.literal("NOT_FOUND"),
            message: z.string(),
          }),
        }),
      },
    })
    .handler((ctx) => {
      // ctx.error should accept the 404 error type
      throw ctx.error({
        error: {
          code: "NOT_FOUND",
          message: "User not found",
        },
      });
      return { id: ctx.input.id };
    });
};

// Test input type inference with all fields
const testInputInference = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      input: {
        params: z.object({
          id: z.string(),
        }),
        query: z.object({
          limit: z.coerce.number().optional(),
        }),
        body: z.object({
          name: z.string(),
        }),
      },
      output: z.object({ id: z.string() }),
    })
    .handler((ctx) => {
      // All should be properly typed
      const id: string = ctx.input.id;
      const _limit: number | undefined = ctx.input.limit;
      const _name: string = ctx.input.name;
      return { id };
    });
};

// Export to ensure types are evaluated
export type RouterTypeTests = [TestValidRouterConfig];

// Export test functions to ensure they compile
export const routerTypeTests = {
  testValidPathParams,
  testParamsWithString,
  testParamsWithCoerce,
  testQueryWithString,
  testQueryWithCoerce,
  testBodyWithNumber,
  testErrorThrowing,
  testInputInference,
};
