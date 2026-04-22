/**
 * Framework-agnostic request/response shapes used between server adapters
 * (hono, express, bun, …) and the Durable Streams runtime. Adapters translate
 * their native request objects into {@link NormalizedRequest} and translate
 * {@link NormalizedResponse} back onto their native response.
 */

/** HTTP methods the protocol defines. */
export type StreamMethod = "GET" | "HEAD" | "PUT" | "POST" | "DELETE";

/**
 * A request that has been normalized by an adapter and is ready for the
 * protocol runtime to dispatch.
 *
 * Adapters MUST:
 *   - Lowercase all header names
 *   - Buffer the request body into a `Uint8Array` (or pass `null` for empty)
 *   - Parse path params from the route template into {@link params}
 *   - Provide an `AbortSignal` that fires when the client disconnects
 */
export interface NormalizedRequest {
  readonly method: StreamMethod;
  /**
   * The canonical stream URL. This is the path component plus any protocol-
   * relevant suffix — it is the stream's identity for storage and for
   * fork-source resolution.
   */
  readonly streamUrl: string;
  /** Path params already extracted by the adapter's router. */
  readonly params: Readonly<Record<string, string>>;
  /** Query params as a flat string map; absent keys are `undefined`. */
  readonly query: Readonly<Record<string, string | undefined>>;
  /** Header names MUST be lowercased by the adapter. */
  readonly headers: Readonly<Record<string, string | undefined>>;
  /** Buffered body bytes, or `null` for empty. */
  readonly body: Uint8Array | null;
  /** Fires when the client disconnects or the request is cancelled. */
  readonly signal: AbortSignal;
}

/**
 * A single Server-Sent Events emission. The runtime yields these from
 * {@link NormalizedResponse.body} when `bodyKind === "sse"`. Adapters format
 * them onto the wire using their framework's native SSE helper.
 */
export interface SseEvent {
  readonly event: "data" | "control";
  readonly data: string;
}

/**
 * A response that the runtime has assembled and is ready for an adapter to
 * translate onto its native response object.
 *
 * For SSE, {@link body} is an async iterable that yields events until the
 * stream is exhausted, the client disconnects, or an explicit close signal
 * is observed (e.g., `streamClosed: true`). Adapters are expected to loop
 * over this iterable and write each event to the wire.
 */
export type NormalizedResponse =
  | {
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly bodyKind: "none";
    }
  | {
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly bodyKind: "bytes";
      readonly body: Uint8Array;
    }
  | {
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly bodyKind: "text";
      readonly body: string;
    }
  | {
      readonly status: number;
      readonly headers: Readonly<Record<string, string>>;
      readonly bodyKind: "sse";
      readonly body: AsyncIterable<SseEvent>;
    };

/**
 * A configured stream endpoint. Produced by the `stream(...)` builder and
 * stored as a router entry. Server adapters duck-type on `_tag` and hand off
 * normalized requests to {@link handle}.
 */
export interface StreamEndpoint {
  readonly _tag: "StreamEndpoint";
  handle(req: NormalizedRequest): Promise<NormalizedResponse>;
}

/** Small helpers for adapters that need to produce responses directly. */
export const NoBody = "none" as const;
