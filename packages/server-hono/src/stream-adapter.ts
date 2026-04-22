import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { MountedStreamEndpoint } from "@alt-stack/server-core";

// Type-only imports keep this file a pure compile-time dependency on
// durable-streams-server. Users who never register a stream endpoint don't
// need the package installed.
import type {
  NormalizedRequest,
  NormalizedResponse,
  SseEvent,
  StreamMethod,
} from "@alt-stack/durable-streams-server";

const STREAM_METHODS: readonly StreamMethod[] = [
  "GET",
  "HEAD",
  "PUT",
  "POST",
  "DELETE",
];

function convertPathToHono(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

/** Translate an OpenAPI-style mounted stream endpoint into Hono routes. */
export function registerStreamEndpoints(
  app: Hono,
  mounted: readonly MountedStreamEndpoint[],
): void {
  for (const { path, endpoint } of mounted) {
    const honoPath = convertPathToHono(path);

    app.on(
      STREAM_METHODS as unknown as string[],
      honoPath,
      async (c: Context) => {
        const req = await honoToNormalized(c);
        if (!STREAM_METHODS.includes(req.method)) {
          return c.body(null, 405);
        }
        const res = (await endpoint.handle(req)) as NormalizedResponse;
        return normalizedToHono(c, res);
      },
    );
  }
}

async function honoToNormalized(c: Context): Promise<NormalizedRequest> {
  const method = c.req.method.toUpperCase() as StreamMethod;

  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const query: Record<string, string | undefined> = {};
  const url = new URL(c.req.url);
  url.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const params = c.req.param() as Record<string, string>;

  let body: Uint8Array | null = null;
  if (method === "POST" || method === "PUT") {
    const ab = await c.req.arrayBuffer();
    body = ab.byteLength > 0 ? new Uint8Array(ab) : null;
  }

  return {
    method,
    streamUrl: url.pathname,
    params,
    query,
    headers,
    body,
    signal: c.req.raw.signal,
  };
}

function normalizedToHono(
  c: Context,
  res: NormalizedResponse,
): Response | Promise<Response> {
  // Cast around Hono's strict header/body overloads. The protocol header
  // names are stable strings (not part of Hono's predefined union) and we
  // trust the runtime to produce well-formed values.
  const setHeader = c.header.bind(c) as (name: string, value: string) => void;
  for (const [name, value] of Object.entries(res.headers)) {
    setHeader(name, value);
  }

  const status = res.status as 200;
  switch (res.bodyKind) {
    case "none":
      return c.body(null, status);
    case "bytes":
      // Cast: Hono's `body` signature can accept BodyInit but the TS overload
      // we hit favors `null`. The underlying runtime accepts Uint8Array.
      return c.body(res.body as unknown as null, status);
    case "text":
      return c.body(res.body as unknown as null, status);
    case "sse":
      return streamSSE(c, async (stream) => {
        const iter: AsyncIterable<SseEvent> = res.body;
        for await (const event of iter) {
          await stream.writeSSE({ event: event.event, data: event.data });
        }
      });
  }
}
