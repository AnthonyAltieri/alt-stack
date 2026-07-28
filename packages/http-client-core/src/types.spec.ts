import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type {
  ExtractRequestBody,
  ExtractRequestParams,
  ExtractRequestQuery,
  ExtractSuccessBody,
  RequestOptions,
} from "./types.js";

const isoDate = z.codec(z.iso.datetime({ offset: true }), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});

const Request = {
  "/events/{at}": {
    POST: {
      params: z.object({ at: isoDate }),
      query: z.object({ since: isoDate }),
      body: z.object({ occursAt: isoDate }),
    },
  },
} as const;

const Response = {
  "/events/{at}": {
    POST: {
      "200": z.object({ occursAt: isoDate }),
    },
  },
} as const;

describe("HTTP client request types", () => {
  it("exposes schema inputs to callers and preserves response outputs", () => {
    expectTypeOf<
      ExtractRequestParams<typeof Request, "/events/{at}", "POST">
    >().toEqualTypeOf<{ at: string }>();
    expectTypeOf<
      ExtractRequestQuery<typeof Request, "/events/{at}", "POST">
    >().toEqualTypeOf<{ since: string }>();
    expectTypeOf<
      ExtractRequestBody<typeof Request, "/events/{at}", "POST">
    >().toEqualTypeOf<{ occursAt: string }>();
    expectTypeOf<
      ExtractSuccessBody<typeof Response, "/events/{at}", "POST">
    >().toEqualTypeOf<{ occursAt: Date }>();

    const inputOptions = {
      params: { at: "2026-07-28T00:00:00.000Z" },
      query: { since: "2026-07-27T00:00:00.000Z" },
      body: { occursAt: "2026-07-28T00:00:00.000Z" },
    } satisfies RequestOptions<typeof Request, "/events/{at}", "POST">;
    expectTypeOf(inputOptions.params.at).toEqualTypeOf<string>();

    const outputOptions = {
      params: {
        // @ts-expect-error - callers provide the codec input, not its parsed output
        at: new Date(),
      },
      query: {
        // @ts-expect-error - callers provide the codec input, not its parsed output
        since: new Date(),
      },
      body: {
        // @ts-expect-error - callers provide the codec input, not its parsed output
        occursAt: new Date(),
      },
    } satisfies RequestOptions<typeof Request, "/events/{at}", "POST">;
    expectTypeOf(outputOptions).toBeObject();
  });
});
