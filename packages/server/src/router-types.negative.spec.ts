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
 * Note: Some constraints (like string input validation) are enforced at runtime
 * rather than compile-time for flexibility. Only compile-time constraints are tested here.
 */

import { z } from "zod";
import type { createRouter } from "./router.js";

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
      return { id: ctx.input.name };
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
      return { id: ctx.input.id };
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
      return { id: ctx.input.id };
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
      // @ts-expect-error - 'name' doesn't exist in input
      const name: string = ctx.input.name;
      return { id: ctx.input.id };
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
      // @ts-expect-error - ctx.input.id is string, not number
      const id: number = ctx.input.id;
      return { id: ctx.input.id };
    });
};

// Export to ensure types are evaluated
// Note: These functions should NOT be callable - they're just for type checking
export const negativeTypeTests = {
  testMissingPathParam,
  testMissingRequiredParam,
  testWrongErrorType,
  testNonExistentProperty,
  testWrongTypeAssignment,
};

