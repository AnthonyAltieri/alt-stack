/**
 * End-to-end example: adding a durable stream endpoint to an alt-stack hono
 * server. Mounts one stream at `/v1/threads/{threadId}` next to a regular
 * procedure at `/hello`. See `streams-example.e2e.spec.ts` for the tests
 * that exercise every verb against this app.
 */
import { createServer, init, router, ok } from "@alt-stack/server-hono";
import { stream, memoryStorage } from "@alt-stack/durable-streams-server";
import { z } from "zod";

const factory = init();
const storage = memoryStorage();

export const appRouter = router({
  "/hello": {
    get: factory.procedure
      .output(z.object({ message: z.string() }))
      .handler(() => ok({ message: "hello" })),
  },

  "/v1/threads/{threadId}": stream({ storage })
    .contentType("application/json")
    .ttl({ default: 3600, max: 86_400 })
    .longPollTimeoutMs(1_000),
});

export const streamsExampleApp = createServer({ api: appRouter });
