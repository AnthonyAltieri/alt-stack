import { describe, it, expect } from "vitest";
import { streamsExampleApp } from "./streams-example.js";

const BASE = "http://localhost";
const JSON_CT = "application/json";

async function send(
  path: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
  },
): Promise<Response> {
  return streamsExampleApp.request(BASE + path, init as RequestInit);
}

describe("streams integration — end to end via Hono adapter", () => {
  const thread = "/v1/threads/e2e-" + Math.random().toString(36).slice(2, 8);

  it("existing procedures still work", async () => {
    const res = await send("/api/hello");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ message: "hello" });
  });

  it("PUT creates a stream", async () => {
    const res = await send(`/api${thread}`, {
      method: "PUT",
      headers: { "content-type": JSON_CT },
    });
    expect(res.status).toBe(201);
    expect(res.headers.get("Stream-Next-Offset")).toBe("-1");
    expect(res.headers.get("Location")).toBe(`/api${thread}`);
  });

  it("POST appends JSON messages (array flattening)", async () => {
    const res = await send(`/api${thread}`, {
      method: "POST",
      headers: { "content-type": JSON_CT },
      body: JSON.stringify([{ role: "user", text: "hi" }, { role: "assistant", text: "hey" }]),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Stream-Next-Offset")).toBeTruthy();
  });

  it("GET catch-up returns JSON array of all messages", async () => {
    const res = await send(`/api${thread}?offset=-1`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Stream-Up-To-Date")).toBe("true");
    const body = await res.json();
    expect(body).toEqual([
      { role: "user", text: "hi" },
      { role: "assistant", text: "hey" },
    ]);
  });

  it("If-None-Match returns 304", async () => {
    const first = await send(`/api${thread}?offset=-1`);
    const etag = first.headers.get("ETag")!;
    const res = await send(`/api${thread}?offset=-1`, {
      headers: { "if-none-match": etag },
    });
    expect(res.status).toBe(304);
  });

  it("HEAD returns metadata without body", async () => {
    const res = await send(`/api${thread}`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Stream-Next-Offset")).toBeTruthy();
    expect(res.headers.get("Content-Type")).toBe(JSON_CT);
  });

  it("idempotent producer dedups retries", async () => {
    const producerHeaders = {
      "content-type": JSON_CT,
      "producer-id": "e2e-producer",
      "producer-epoch": "0",
      "producer-seq": "0",
    };
    const body = JSON.stringify({ dedupe: true });

    const r1 = await send(`/api${thread}`, {
      method: "POST",
      headers: producerHeaders,
      body,
    });
    expect(r1.status).toBe(200);
    expect(r1.headers.get("Producer-Epoch")).toBe("0");
    expect(r1.headers.get("Producer-Seq")).toBe("0");

    const r2 = await send(`/api${thread}`, {
      method: "POST",
      headers: producerHeaders,
      body,
    });
    expect(r2.status).toBe(204);
  });

  it("long-poll times out with 204 + Stream-Up-To-Date", async () => {
    const head = await send(`/api${thread}`, { method: "HEAD" });
    const tail = head.headers.get("Stream-Next-Offset")!;
    const res = await send(`/api${thread}?offset=${encodeURIComponent(tail)}&live=long-poll`);
    expect(res.status).toBe(204);
    expect(res.headers.get("Stream-Up-To-Date")).toBe("true");
    expect(res.headers.get("Stream-Cursor")).toBeTruthy();
  });

  it("atomic append-and-close then reads show Stream-Closed", async () => {
    const res = await send(`/api${thread}`, {
      method: "POST",
      headers: { "content-type": JSON_CT, "stream-closed": "true" },
      body: JSON.stringify({ final: true }),
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Stream-Closed")).toBe("true");

    const read = await send(`/api${thread}?offset=-1`);
    expect(read.headers.get("Stream-Closed")).toBe("true");
  });

  it("append to closed stream returns 409 with Stream-Closed + Stream-Next-Offset", async () => {
    const res = await send(`/api${thread}`, {
      method: "POST",
      headers: { "content-type": JSON_CT },
      body: JSON.stringify({ late: true }),
    });
    expect(res.status).toBe(409);
    expect(res.headers.get("Stream-Closed")).toBe("true");
    expect(res.headers.get("Stream-Next-Offset")).toBeTruthy();
  });

  it("DELETE removes the stream", async () => {
    const res = await send(`/api${thread}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    const head = await send(`/api${thread}`, { method: "HEAD" });
    expect(head.status).toBe(404);
  });
});
