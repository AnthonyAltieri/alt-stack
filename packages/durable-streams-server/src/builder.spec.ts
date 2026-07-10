import { describe, it, expect } from "vitest";
import { stream } from "./builder.js";
import { memoryStorage } from "./memory.js";
import type { NormalizedRequest, NormalizedResponse } from "./types.js";

const JSON_CT = "application/json";

function req(overrides: Partial<NormalizedRequest> = {}): NormalizedRequest {
  return {
    method: "GET",
    streamUrl: "/a",
    params: {},
    query: {},
    headers: {},
    body: null,
    signal: new AbortController().signal,
    ...overrides,
  };
}

describe("stream() builder", () => {
  it("produces a value with _tag === 'StreamEndpoint'", () => {
    const ep = stream({ storage: memoryStorage() });
    expect(ep._tag).toBe("StreamEndpoint");
    expect(typeof ep.handle).toBe("function");
  });

  it("chains builder calls fluently and retains config", async () => {
    const ep = stream({ storage: memoryStorage() })
      .contentType(JSON_CT)
      .ttl({ default: 60, max: 3600 })
      .maxBodyBytes(1024)
      .longPollTimeoutMs(500)
      .maxReadBytes(1024);

    // Can still be invoked as a normal endpoint.
    const res = await ep.handle(
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    expect(res.status).toBe(201);
  });

  it("runs middleware in declaration order and can short-circuit", async () => {
    const calls: string[] = [];
    const ep = stream({ storage: memoryStorage() })
      .use(async (_r, next) => {
        calls.push("outer-before");
        const res = await next();
        calls.push("outer-after");
        return res;
      })
      .use(async (_r, _next) => {
        calls.push("inner");
        const res: NormalizedResponse = {
          status: 401,
          headers: {},
          bodyKind: "none",
        };
        return res;
      });

    const res = await ep.handle(req({ method: "HEAD" }));
    expect(res.status).toBe(401);
    expect(calls).toEqual(["outer-before", "inner", "outer-after"]);
  });

  it("falls through to the runtime when no middleware short-circuits", async () => {
    const ep = stream({ storage: memoryStorage() })
      .use(async (_r, next) => next());

    await ep.handle(
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    const res = await ep.handle(req({ method: "HEAD", streamUrl: "/a" }));
    expect(res.status).toBe(200);
  });

  it("enforces content-type allow-list on PUT", async () => {
    const ep = stream({ storage: memoryStorage() }).contentType(JSON_CT);
    const res = await ep.handle(
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(409);
  });
});
