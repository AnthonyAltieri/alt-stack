import type {
  NormalizedRequest,
  NormalizedResponse,
  StreamEndpoint,
} from "./types.js";
import type { Storage } from "./storage.js";
import { handleStreamRequest, type EndpointConfig } from "./runtime.js";

/**
 * Middleware that runs before the protocol runtime. Short-circuit by
 * returning a response directly; otherwise call `next()` to continue. The
 * chain runs left-to-right in declaration order.
 */
export type StreamMiddleware = (
  req: NormalizedRequest,
  next: () => Promise<NormalizedResponse>,
) => Promise<NormalizedResponse>;

/** Options accepted by `stream({...})`. */
export interface StreamOptions {
  readonly storage: Storage;
}

/**
 * Configuration knobs exposed by the builder. Mutable internally; frozen
 * when the endpoint is invoked.
 */
interface BuilderState {
  readonly storage: Storage;
  contentType?: string | readonly string[];
  ttl?: { default?: number; max?: number };
  maxBodyBytes?: number;
  longPollTimeoutMs?: number;
  maxReadBytes?: number;
  rng?: () => number;
  middleware: StreamMiddleware[];
}

/**
 * Fluent builder that configures a stream endpoint. The builder itself is
 * the endpoint: it satisfies {@link StreamEndpoint} so it can be placed
 * directly into a router as a route entry.
 *
 * Server adapters (hono, express, bun, …) duck-type on `_tag` and dispatch
 * the request to `.handle(req)`.
 */
export class StreamBuilder implements StreamEndpoint {
  readonly _tag = "StreamEndpoint" as const;

  private state: BuilderState;

  constructor(options: StreamOptions) {
    this.state = { storage: options.storage, middleware: [] };
  }

  /**
   * Constrain the content types this endpoint accepts on `PUT`. If set,
   * `PUT` requests with a disagreeing `Content-Type` fail with 409. Omit
   * to allow any content type (each stream is locked to its declared type
   * at creation).
   */
  contentType(ct: string | readonly string[]): this {
    this.state.contentType = ct;
    return this;
  }

  /**
   * Clamp client-supplied `Stream-TTL` values. `default` is used when the
   * client omits the header; `max` is the upper bound enforced on create.
   */
  ttl(opts: { default?: number; max?: number }): this {
    this.state.ttl = opts;
    return this;
  }

  /** Upper bound on POST / PUT body size. */
  maxBodyBytes(n: number): this {
    this.state.maxBodyBytes = n;
    return this;
  }

  /** Long-poll wait duration in milliseconds. Defaults to 30_000. */
  longPollTimeoutMs(ms: number): this {
    this.state.longPollTimeoutMs = ms;
    return this;
  }

  /** Catch-up chunk byte cap. Defaults to 1 MiB. */
  maxReadBytes(n: number): this {
    this.state.maxReadBytes = n;
    return this;
  }

  /**
   * Override the random source used for cursor jitter (see Section 8 of the
   * protocol). The protocol requires live-mode cursors to advance strictly
   * monotonically when the client's echoed cursor catches up to the server;
   * the jitter amount comes from this RNG.
   *
   * Default: `Math.random`. Override when you need deterministic tests,
   * reproducible load-test traces, or a seeded PRNG for CDN cache-key
   * predictability.
   */
  rng(rng: () => number): this {
    this.state.rng = rng;
    return this;
  }

  /** Prepend a middleware to the chain. Runs before the protocol runtime. */
  use(mw: StreamMiddleware): this {
    this.state.middleware.push(mw);
    return this;
  }

  async handle(req: NormalizedRequest): Promise<NormalizedResponse> {
    const cfg = toEndpointConfig(this.state);
    const runtimeCall = () => handleStreamRequest(cfg, req);
    if (this.state.middleware.length === 0) return runtimeCall();

    // Compose middleware right-to-left so earlier .use() calls run first.
    let next: () => Promise<NormalizedResponse> = runtimeCall;
    for (let i = this.state.middleware.length - 1; i >= 0; i--) {
      const mw = this.state.middleware[i]!;
      const prev = next;
      next = () => mw(req, prev);
    }
    return next();
  }
}

function toEndpointConfig(s: BuilderState): EndpointConfig {
  const cfg: {
    storage: Storage;
    contentType?: string | readonly string[];
    ttl?: { default?: number; max?: number };
    maxBodyBytes?: number;
    longPollTimeoutMs?: number;
    maxReadBytes?: number;
    rng?: () => number;
  } = { storage: s.storage };
  if (s.contentType !== undefined) cfg.contentType = s.contentType;
  if (s.ttl !== undefined) cfg.ttl = s.ttl;
  if (s.maxBodyBytes !== undefined) cfg.maxBodyBytes = s.maxBodyBytes;
  if (s.longPollTimeoutMs !== undefined) cfg.longPollTimeoutMs = s.longPollTimeoutMs;
  if (s.maxReadBytes !== undefined) cfg.maxReadBytes = s.maxReadBytes;
  if (s.rng !== undefined) cfg.rng = s.rng;
  return cfg;
}

/**
 * Create a durable-streams endpoint. Place the returned builder directly as
 * a route entry in your alt-stack router.
 *
 * @example
 * ```ts
 * router({
 *   "/v1/threads/{threadId}": stream({ storage })
 *     .contentType("application/json")
 *     .ttl({ default: 3600 })
 *     .use(authMiddleware),
 * });
 * ```
 */
export function stream(options: StreamOptions): StreamBuilder {
  return new StreamBuilder(options);
}
