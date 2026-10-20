import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type { ApiClient } from "./index.js";
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
  it("derives body requirements from the schema for every write method", () => {
    const bodyless = { params: z.object({ id: z.string() }) };
    const required = { body: z.object({ reason: z.string() }) };
    const optional = { body: required.body.optional() };
    const schemas = {
      "/v1/jobs/{id}/cancel": { POST: bodyless, PUT: bodyless, PATCH: bodyless, DELETE: bodyless },
      "/required": { POST: required, PUT: required, PATCH: required, DELETE: required },
      "/optional": { POST: optional, PUT: optional, PATCH: optional, DELETE: optional },
    } as const;

    function checkCalls(client: ApiClient<typeof schemas, {}>) {
      for (const method of ["post", "put", "patch", "delete"] as const) {
        void client[method]("/v1/jobs/{id}/cancel", { params: { id: "job-1" } });
        // @ts-expect-error Operations without a body schema reject payloads.
        void client[method]("/v1/jobs/{id}/cancel", { params: { id: "job-1" }, body: {} });
        void client[method]("/required", { body: { reason: "cancelled" } });
        // @ts-expect-error Required body schemas still require a payload.
        void client[method]("/required", {});
        void client[method]("/optional", {});
        void client[method]("/optional", { body: { reason: "cancelled" } });
      }
    }

    expectTypeOf(checkCalls).toBeFunction();
  });

  it("requires branded path identifiers while preserving codec, query and body inputs", () => {
    const userId = z.string().brand<"UserId">();
    const schemas = {
      "/v1/users/{user_id}": { POST: {
        params: z.object({
          user_id: userId,
          at: isoDate,
          empty: z.codec(z.literal("none"), z.null(), {
            decode: () => null,
            encode: () => "none" as const,
          }),
        }),
        query: z.object({ user_id: userId }),
        body: z.object({ user_id: userId }),
      } },
    } as const;
    type Options = RequestOptions<typeof schemas, "/v1/users/{user_id}", "POST">;
    const options = {
      params: { user_id: userId.parse("u_1"), at: "2026-07-28T00:00:00.000Z", empty: "none" },
      query: { user_id: "u_1" },
      body: { user_id: "u_1" },
    } satisfies Options;
    expectTypeOf(options).toExtend<Options>();
    const invalid: Options = { ...options, params: {
      ...options.params,
      // @ts-expect-error Path identifiers must carry the schema's brand.
      user_id: "u_1",
    } };
    expectTypeOf(invalid).toExtend<Options>();
  });

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
