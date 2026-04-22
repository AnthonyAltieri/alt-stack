import { describe, it, expect, beforeEach } from "vitest";
import { handleStreamRequest, type EndpointConfig } from "./runtime.js";
import { memoryStorage } from "./memory.js";
import type { NormalizedRequest, SseEvent } from "./types.js";

const JSON_CT = "application/json";
const encoder = new TextEncoder();

function req(overrides: Partial<NormalizedRequest> = {}): NormalizedRequest {
  return {
    method: "GET",
    streamUrl: "/s",
    params: {},
    query: {},
    headers: {},
    body: null,
    signal: new AbortController().signal,
    ...overrides,
  };
}

function jsonBody(x: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(x));
}

describe("runtime — PUT (create)", () => {
  let cfg: EndpointConfig;
  beforeEach(() => {
    cfg = { storage: memoryStorage() };
  });

  it("creates a new stream and returns 201 with Location", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers["Location"]).toBe("/a");
    expect(res.headers["Content-Type"]).toBe(JSON_CT);
    expect(res.headers["Stream-Next-Offset"]).toBe("-1");
  });

  it("is idempotent: matching PUT to existing stream returns 200", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["Location"]).toBeUndefined();
  });

  it("mismatched config returns 409", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(409);
  });

  it("create-and-close with Stream-Closed: true", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT, "stream-closed": "true" },
      }),
    );
    expect(res.status).toBe(201);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("rejects conflicting Stream-TTL + Stream-Expires-At", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: {
          "content-type": JSON_CT,
          "stream-ttl": "60",
          "stream-expires-at": "2099-01-01T00:00:00Z",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects bad Stream-TTL syntax", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT, "stream-ttl": "+60" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("content-type allow-list rejects disallowed PUT", async () => {
    cfg = { storage: memoryStorage(), contentType: JSON_CT };
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": "text/plain" },
      }),
    );
    expect(res.status).toBe(409);
  });
});

describe("runtime — HEAD / DELETE", () => {
  let cfg: EndpointConfig;
  beforeEach(async () => {
    cfg = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
  });

  it("HEAD returns 200 with metadata", async () => {
    const res = await handleStreamRequest(cfg, req({ method: "HEAD", streamUrl: "/a" }));
    expect(res.status).toBe(200);
    expect(res.headers["Stream-Next-Offset"]).toBe("-1");
    expect(res.headers["Cache-Control"]).toBe("no-store");
  });

  it("HEAD of unknown stream returns 404", async () => {
    const res = await handleStreamRequest(cfg, req({ method: "HEAD", streamUrl: "/nope" }));
    expect(res.status).toBe(404);
  });

  it("DELETE returns 204", async () => {
    const res = await handleStreamRequest(cfg, req({ method: "DELETE", streamUrl: "/a" }));
    expect(res.status).toBe(204);
  });
});

describe("runtime — POST (append, JSON mode)", () => {
  let cfg: EndpointConfig;
  beforeEach(async () => {
    cfg = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
  });

  it("appends a single JSON object as one message", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody({ x: 1 }),
      }),
    );
    expect(res.status).toBe(204);

    const read = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    expect(read.status).toBe(200);
    if (read.bodyKind === "text") expect(read.body).toBe('[{"x":1}]');
  });

  it("flattens a JSON array body into N messages", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody([{ a: 1 }, { b: 2 }]),
      }),
    );
    const read = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    if (read.bodyKind === "text") expect(read.body).toBe('[{"a":1},{"b":2}]');
  });

  it("rejects empty JSON array body", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody([]),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects empty body without Stream-Closed: true", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: null,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("close-only POST with empty body + Stream-Closed: true returns 204", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
        body: null,
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("close-only POST is idempotent when already closed", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
        body: null,
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
        body: null,
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("append-and-close atomically closes", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT, "stream-closed": "true" },
        body: jsonBody({ final: true }),
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("append to closed stream returns 409 with Stream-Closed + Stream-Next-Offset", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT, "stream-closed": "true" },
        body: jsonBody({ final: true }),
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody({ late: true }),
      }),
    );
    expect(res.status).toBe(409);
    expect(res.headers["Stream-Closed"]).toBe("true");
    expect(res.headers["Stream-Next-Offset"]).toBeDefined();
  });

  it("content-type mismatch returns 409", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": "text/plain" },
        body: encoder.encode("hi"),
      }),
    );
    expect(res.status).toBe(409);
  });

  it("error precedence: closed-check wins over content-type mismatch", async () => {
    // Close the stream first.
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
        body: null,
      }),
    );
    // Now send an append with a mismatched Content-Type. Per spec §5.2, the
    // closed check takes precedence so clients always see Stream-Closed.
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": "text/plain" },
        body: encoder.encode("hi"),
      }),
    );
    expect(res.status).toBe(409);
    expect(res.headers["Stream-Closed"]).toBe("true");
    expect(res.headers["Stream-Next-Offset"]).toBeDefined();
  });
});

describe("runtime — POST idempotent producers", () => {
  let cfg: EndpointConfig;
  beforeEach(async () => {
    cfg = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
  });

  const producerReq = (epoch: string, seq: string, body: unknown, close = false) =>
    req({
      method: "POST",
      streamUrl: "/a",
      headers: {
        "content-type": JSON_CT,
        "producer-id": "w1",
        "producer-epoch": epoch,
        "producer-seq": seq,
        ...(close ? { "stream-closed": "true" } : {}),
      },
      body: jsonBody(body),
    });

  it("accepts initial (0,0) and emits Producer-Epoch/Seq headers", async () => {
    const res = await handleStreamRequest(cfg, producerReq("0", "0", { a: 1 }));
    expect(res.status).toBe(200);
    expect(res.headers["Producer-Epoch"]).toBe("0");
    expect(res.headers["Producer-Seq"]).toBe("0");
  });

  it("dedups a retry with 204 and echoes current state", async () => {
    await handleStreamRequest(cfg, producerReq("0", "0", { a: 1 }));
    const res = await handleStreamRequest(cfg, producerReq("0", "0", { a: 1 }));
    expect(res.status).toBe(204);
    expect(res.headers["Producer-Epoch"]).toBe("0");
    expect(res.headers["Producer-Seq"]).toBe("0");
  });

  it("fences a stale epoch with 403 + Producer-Epoch", async () => {
    await handleStreamRequest(cfg, producerReq("0", "0", { a: 1 }));
    await handleStreamRequest(cfg, producerReq("1", "0", { b: 1 }));
    const res = await handleStreamRequest(cfg, producerReq("0", "1", { z: 1 }));
    expect(res.status).toBe(403);
    expect(res.headers["Producer-Epoch"]).toBe("1");
  });

  it("sequence gap returns 409 with expected/received", async () => {
    await handleStreamRequest(cfg, producerReq("0", "0", { a: 1 }));
    const res = await handleStreamRequest(cfg, producerReq("0", "2", { b: 1 }));
    expect(res.status).toBe(409);
    expect(res.headers["Producer-Expected-Seq"]).toBe("1");
    expect(res.headers["Producer-Received-Seq"]).toBe("2");
  });

  it("close-only on already-closed stream returns 204 regardless of producer", async () => {
    // Close the stream first with no producer headers.
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
        body: null,
      }),
    );

    // A fresh producer now sends close-only to the already-closed stream.
    // Per spec §5.2 (SHOULD), close-only is idempotent and must return 204
    // — NOT 409 — even though this producer never closed anything.
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: {
          "stream-closed": "true",
          "producer-id": "fresh-closer",
          "producer-epoch": "0",
          "producer-seq": "0",
        },
        body: null,
      }),
    );
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Closed"]).toBe("true");
    expect(res.headers["Stream-Next-Offset"]).toBeDefined();
  });

  it("close-only with producer headers: first close echoes producer state, retry returns 204", async () => {
    const producerHeaders = {
      "producer-id": "closer",
      "producer-epoch": "0",
      "producer-seq": "0",
      "stream-closed": "true",
    };

    // First close: stream is open, routes through appendWithProducer.
    // Producer state is advanced and echoed in response headers.
    const first = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: producerHeaders,
        body: null,
      }),
    );
    expect(first.status).toBe(204);
    expect(first.headers["Stream-Closed"]).toBe("true");
    expect(first.headers["Producer-Epoch"]).toBe("0");
    expect(first.headers["Producer-Seq"]).toBe("0");

    // Retry: stream is already closed → idempotent 204 short-circuit (spec
    // §5.2). Producer headers aren't echoed on the short-circuit path since
    // no new accepted seq is being reported; the runtime avoids advancing
    // producer state on terminal streams.
    const retry = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: producerHeaders,
        body: null,
      }),
    );
    expect(retry.status).toBe(204);
    expect(retry.headers["Stream-Closed"]).toBe("true");
  });

  it("partial producer headers return 400", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: {
          "content-type": JSON_CT,
          "producer-id": "w1",
          "producer-epoch": "0",
          // missing producer-seq
        },
        body: jsonBody({ a: 1 }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("runtime — GET catch-up", () => {
  let cfg: EndpointConfig;
  beforeEach(async () => {
    cfg = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody([{ i: 1 }, { i: 2 }]),
      }),
    );
  });

  it("reads from -1 and includes Stream-Up-To-Date and ETag", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["Stream-Up-To-Date"]).toBe("true");
    expect(res.headers["ETag"]).toBeDefined();
    if (res.bodyKind === "text") expect(res.body).toBe('[{"i":1},{"i":2}]');
  });

  it("If-None-Match on current ETag returns 304", async () => {
    const first = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    const etag = first.headers["ETag"]!;
    const res = await handleStreamRequest(
      cfg,
      req({
        streamUrl: "/a",
        query: { offset: "-1" },
        headers: { "if-none-match": etag },
      }),
    );
    expect(res.status).toBe(304);
  });

  it("offset=now returns empty JSON array and no ETag", async () => {
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "now" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["ETag"]).toBeUndefined();
    expect(res.headers["Stream-Up-To-Date"]).toBe("true");
    if (res.bodyKind === "text") expect(res.body).toBe("[]");
  });

  it("offset=now on closed stream returns Stream-Closed: true", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "now" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("reading from tail of closed stream shows Stream-Closed", async () => {
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["Stream-Closed"]).toBe("true");
    expect(res.headers["Stream-Up-To-Date"]).toBe("true");
  });
});

describe("runtime — maxBodyBytes", () => {
  it("rejects oversize POST with 413", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      maxBodyBytes: 16,
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    const big = encoder.encode(JSON.stringify({ payload: "x".repeat(64) }));
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: big,
      }),
    );
    expect(res.status).toBe(413);
  });

  it("rejects oversize PUT initial body with 413", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      maxBodyBytes: 16,
    };
    const big = encoder.encode(JSON.stringify([{ a: 1 }, { b: 2 }, { c: 3 }]));
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: big,
      }),
    );
    expect(res.status).toBe(413);
  });

  it("allows bodies at or below the cap", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      maxBodyBytes: 1024,
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: encoder.encode('{"x":1}'),
      }),
    );
    expect(res.status).toBe(204);
  });
});

describe("runtime — nosniff default", () => {
  it("sets X-Content-Type-Options: nosniff on every response", async () => {
    const cfg: EndpointConfig = { storage: memoryStorage() };
    const put = await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    expect(put.headers["X-Content-Type-Options"]).toBe("nosniff");

    const head = await handleStreamRequest(cfg, req({ method: "HEAD", streamUrl: "/a" }));
    expect(head.headers["X-Content-Type-Options"]).toBe("nosniff");

    const get = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1" } }),
    );
    expect(get.headers["X-Content-Type-Options"]).toBe("nosniff");
  });
});

describe("runtime — injectable rng", () => {
  it("uses cfg.rng for cursor jitter instead of Math.random", async () => {
    // Fixed rng → deterministic jitter. Use a value that produces the max
    // jitter interval so we can assert an exact cursor advance.
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      longPollTimeoutMs: 20,
      rng: () => 0, // jitterIntervals = 1 + floor(0 * 180) = 1
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );

    // First long-poll: client sends no cursor → gets current server interval.
    const first = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1", live: "long-poll" } }),
    );
    const serverCursor = Number(first.headers["Stream-Cursor"]);
    expect(Number.isFinite(serverCursor)).toBe(true);

    // Second long-poll: client echoes the exact same cursor → must be bumped
    // by exactly 1 interval (rng=0 maps to jitter=1).
    const second = await handleStreamRequest(
      cfg,
      req({
        streamUrl: "/a",
        query: { offset: "-1", live: "long-poll", cursor: String(serverCursor) },
      }),
    );
    expect(Number(second.headers["Stream-Cursor"])).toBe(serverCursor + 1);
  });
});

describe("runtime — GET long-poll", () => {
  it("returns 204 with Stream-Up-To-Date on timeout", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      longPollTimeoutMs: 20,
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1", live: "long-poll" } }),
    );
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Up-To-Date"]).toBe("true");
    expect(res.headers["Stream-Cursor"]).toBeDefined();
  });

  it("returns immediately at tail of closed stream (no wait)", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      longPollTimeoutMs: 60_000,
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
      }),
    );
    const start = Date.now();
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "now", live: "long-poll" } }),
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(res.status).toBe(204);
    expect(res.headers["Stream-Closed"]).toBe("true");
  });

  it("wakes up on append and returns 200 with new data", async () => {
    const cfg: EndpointConfig = {
      storage: memoryStorage(),
      longPollTimeoutMs: 5000,
    };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    const headRes = await handleStreamRequest(
      cfg,
      req({ method: "HEAD", streamUrl: "/a" }),
    );
    const from = headRes.headers["Stream-Next-Offset"]!;

    const pollPromise = handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: from, live: "long-poll" } }),
    );
    await new Promise((r) => setImmediate(r));
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody({ arrived: true }),
      }),
    );
    const res = await pollPromise;
    expect(res.status).toBe(200);
    if (res.bodyKind === "text")
      expect(res.body).toBe('[{"arrived":true}]');
  });
});

describe("runtime — GET SSE", () => {
  it("emits data + control events and closes on stream closure", async () => {
    const cfg: EndpointConfig = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({ method: "PUT", streamUrl: "/a", headers: { "content-type": JSON_CT } }),
    );
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT },
        body: jsonBody([{ m: 1 }, { m: 2 }]),
      }),
    );
    // Close the stream so SSE terminates deterministically.
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/a",
        headers: { "stream-closed": "true" },
      }),
    );

    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "-1", live: "sse" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers["Content-Type"]).toBe("text/event-stream");
    expect(res.bodyKind).toBe("sse");

    if (res.bodyKind !== "sse") throw new Error("expected SSE body");
    const events: SseEvent[] = [];
    for await (const e of res.body) events.push(e);

    expect(events.some((e) => e.event === "data")).toBe(true);
    const final = events[events.length - 1]!;
    expect(final.event).toBe("control");
    const parsed = JSON.parse(final.data);
    expect(parsed.streamClosed).toBe(true);
  });

  it("immediately emits closed control event when at tail of closed stream", async () => {
    const cfg: EndpointConfig = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/a",
        headers: { "content-type": JSON_CT, "stream-closed": "true" },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/a", query: { offset: "now", live: "sse" } }),
    );
    if (res.bodyKind !== "sse") throw new Error("expected SSE body");
    const events: SseEvent[] = [];
    for await (const e of res.body) events.push(e);
    expect(events.length).toBe(1);
    expect(events[0]!.event).toBe("control");
    const parsed = JSON.parse(events[0]!.data);
    expect(parsed.streamClosed).toBe(true);
    expect(parsed.upToDate).toBe(true);
  });

  it("sets stream-sse-data-encoding: base64 for non-text content types", async () => {
    const cfg: EndpointConfig = { storage: memoryStorage() };
    await handleStreamRequest(
      cfg,
      req({
        method: "PUT",
        streamUrl: "/blob",
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/blob",
        headers: { "content-type": "application/octet-stream" },
        body: new Uint8Array([1, 2, 3, 4]),
      }),
    );
    await handleStreamRequest(
      cfg,
      req({
        method: "POST",
        streamUrl: "/blob",
        headers: { "stream-closed": "true" },
      }),
    );
    const res = await handleStreamRequest(
      cfg,
      req({ streamUrl: "/blob", query: { offset: "-1", live: "sse" } }),
    );
    expect(res.headers["stream-sse-data-encoding"]).toBe("base64");
  });
});
