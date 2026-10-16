import { expect, it, vi } from "vitest";
import { createApiClient } from "./index.js";

it("applies async client headers before request overrides through Ky", async () => {
  const requests: Request[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    if (!(input instanceof Request)) throw new Error("Expected a Request");
    requests.push(input);
    return new Response("ok");
  });
  const client = createApiClient({
    baseUrl: "https://api.example.test",
    Request: { "/health": { GET: {} } },
    Response: {},
    headers: async () => ({ Authorization: "Bearer token", "X-Request-Id": "client-id" }),
    kyOptions: { fetch, retry: 0 },
  });

  const result = await client.get("/health", { headers: { "X-Request-Id": "request-id" } });

  expect(result).toMatchObject({ success: true, body: "ok" });
  expect(fetch).toHaveBeenCalledOnce();
  expect(requests[0]?.headers.get("Authorization")).toBe("Bearer token");
  expect(requests[0]?.headers.get("X-Request-Id")).toBe("request-id");
});
