/**
 * Negative Type Tests - Tests that verify type constraints ERROR when they should
 *
 * This file contains tests that should FAIL to compile, verifying that
 * type constraints work correctly. Each test uses @ts-expect-error to mark
 * expected type errors.
 *
 * To verify these tests:
 * 1. Run `pnpm check-types` - it should pass (errors are expected)
 * 2. Remove @ts-expect-error comments - type errors should occur
 * 3. Fix the code - type errors should disappear
 *
 * Compile-time constraints tested here:
 * - Path parameter matching (params must contain all path variables)
 * - String input validation (params/query must accept string input)
 * - Error type matching
 * - Property access validation
 */

import { z } from "zod";
import type { createRouter } from "./router.js";
import { init } from "./init.js";

// Test 1: Missing path param should cause error
const testMissingPathParam = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}" as const, {
      // @ts-expect-error - Missing 'id' param in params schema should cause type error
      input: {
        params: z.object({
          name: z.string(), // Missing 'id' - should cause type error
        }),
      },
      output: z.object({ id: z.string() }),
    })
    .handler((ctx) => {
      return { id: ctx.input.params.name };
    });
};

// Test 2: Missing required path param in params schema
const testMissingRequiredParam = <T extends typeof createRouter>(router: T) => {
  router()
    .get("/users/{id}/posts/{postId}" as const, {
      // @ts-expect-error - Missing 'postId' param in params schema
      input: {
        params: z.object({
          id: z.string(),
          // Missing postId - should cause type error
        }),
      },
      output: z.object({ id: z.string() }),
    })
    .handler((ctx) => {
      return { id: ctx.input.params.id };
    });
};

// Test 3: Wrong error type in ctx.error should error
const testWrongErrorType = <T extends typeof createRouter>(router: T) => {
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
      throw ctx.error({
        error: {
          // @ts-expect-error - Wrong error type should cause type error
          code: "BAD_REQUEST", // Wrong code - should error
          message: "Bad request",
        },
      });
      return { id: ctx.input.params.id };
    });
};

// Test 4: Accessing non-existent property should error
const testNonExistentProperty = <T extends typeof createRouter>(router: T) => {
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
      // @ts-expect-error - 'name' doesn't exist in input.params
      const _name: string = ctx.input.params.name;
      return { id: ctx.input.params.id };
    });
};

// Test 5: Wrong type assignment should error
const testWrongTypeAssignment = <T extends typeof createRouter>(router: T) => {
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
      // @ts-expect-error - ctx.input.params.id is string, not number
      const _id: number = ctx.input.params.id;
      return { id: ctx.input.params.id };
    });
};

// Test 6: Using z.number() in params should error (doesn't accept string input)
const testNumberInParams = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - z.number() in params doesn't accept string input
      params: z.object({
        id: z.string(),
        age: z.number(), // ❌ Invalid - z.number() doesn't accept string
      }),
    })
    .output(z.object({ id: z.string() }))
    .get(() => ({ id: "1" }));
};

// Test 7: Using z.boolean() in params should error
const testBooleanInParams = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - z.boolean() in params doesn't accept string input
      params: z.object({
        id: z.string(),
        active: z.boolean(), // ❌ Invalid - z.boolean() doesn't accept string
      }),
    })
    .output(z.object({ id: z.string() }))
    .get(() => ({ id: "1" }));
};

// Test 8: Using z.number() in query should error
const testNumberInQuery = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - z.number() in query doesn't accept string input
      query: z.object({
        page: z.number(), // ❌ Invalid - z.number() doesn't accept string
      }),
    })
    .output(z.object({ count: z.number() }))
    .get(() => ({ count: 0 }));
};

// Test 9: Using z.boolean() in query should error
const testBooleanInQuery = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - z.boolean() in query doesn't accept string input
      query: z.object({
        active: z.boolean(), // ❌ Invalid - z.boolean() doesn't accept string
      }),
    })
    .output(z.object({ count: z.number() }))
    .get(() => ({ count: 0 }));
};

// Test 10: Mixed valid and invalid types in params should error
const testMixedTypesInParams = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - Contains z.number() which doesn't accept string input
      params: z.object({
        id: z.string(), // ✅ Valid
        name: z.string(), // ✅ Valid
        age: z.number(), // ❌ Invalid
      }),
    })
    .output(z.object({ id: z.string() }))
    .get(() => ({ id: "1" }));
};

// Test 11: Using z.array() in query should error (arrays not allowed)
const testArrayInQuery = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - z.array() in query is not allowed
      query: z.object({
        ids: z.array(z.string()), // ❌ Invalid - arrays not allowed in query
      }),
    })
    .output(z.object({ count: z.number() }))
    .get(() => ({ count: 0 }));
};

// Test 12: Using z.object() nested in params should error
const testNestedObjectInParams = () => {
  const factory = init();
  factory.procedure
    .input({
      // @ts-expect-error - nested object in params doesn't accept string input
      params: z.object({
        user: z.object({ id: z.string() }), // ❌ Invalid - nested object
      }),
    })
    .output(z.object({ id: z.string() }))
    .get(() => ({ id: "1" }));
};

// Export to ensure types are evaluated
// Note: These functions should NOT be callable - they're just for type checking
export const negativeTypeTests = {
  testMissingPathParam,
  testMissingRequiredParam,
  testWrongErrorType,
  testNonExistentProperty,
  testWrongTypeAssignment,
  testNumberInParams,
  testBooleanInParams,
  testNumberInQuery,
  testBooleanInQuery,
  testMixedTypesInParams,
  testArrayInQuery,
  testNestedObjectInParams,
};
