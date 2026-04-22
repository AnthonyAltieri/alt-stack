import { ok, err, TaggedError, type Result } from "@alt-stack/result";

/**
 * Cursor math for CDN/proxy collapsing (Durable Streams Protocol Section 8).
 *
 * The cursor is a monotonically non-decreasing interval number, derived from
 * a fixed epoch plus a fixed interval duration. Clients echo the last cursor
 * they received back as a `cursor=<N>` query parameter; servers respond with
 * a cursor that is strictly greater whenever the client's echoed cursor is
 * greater than or equal to the current wall-clock interval. This forces
 * different cache keys over time and prevents CDN cache cycles where a
 * stale "no new data" response is served forever.
 */

/** October 9, 2024 00:00:00 UTC, per Section 8. */
export const DEFAULT_CURSOR_EPOCH_MS = Date.UTC(2024, 9, 9, 0, 0, 0);

/** 20 seconds, per Section 8. */
export const DEFAULT_CURSOR_INTERVAL_SEC = 20;

/** Upper bound of the jitter range the spec calls out: "1-3600 seconds". */
export const DEFAULT_MAX_JITTER_SEC = 3600;

export interface CursorConfig {
  /** Absolute epoch start in milliseconds since the Unix epoch. */
  readonly epochMs?: number;
  /** Interval width in seconds. */
  readonly intervalSec?: number;
  /** Maximum jitter window, in seconds. Used when advancing a stuck cursor. */
  readonly maxJitterSec?: number;
}

interface ResolvedCursorConfig {
  readonly epochMs: number;
  readonly intervalSec: number;
  readonly maxJitterSec: number;
}

function resolve(config: CursorConfig | undefined): ResolvedCursorConfig {
  return {
    epochMs: config?.epochMs ?? DEFAULT_CURSOR_EPOCH_MS,
    intervalSec: config?.intervalSec ?? DEFAULT_CURSOR_INTERVAL_SEC,
    maxJitterSec: config?.maxJitterSec ?? DEFAULT_MAX_JITTER_SEC,
  };
}

/**
 * Compute the current cursor as an integer interval number.
 *
 * Returns `nowMs < epochMs ? 0 : floor((nowMs - epochMs) / (intervalSec*1000))`.
 * Callers encode this as a decimal string for the wire.
 */
export function computeCursor(nowMs: number, config?: CursorConfig): number {
  const { epochMs, intervalSec } = resolve(config);
  if (nowMs < epochMs) return 0;
  return Math.floor((nowMs - epochMs) / (intervalSec * 1000));
}

export class CursorParseError extends TaggedError {
  readonly _tag = "CursorParseError";
  constructor(public readonly raw: string) {
    super(`Invalid cursor value: ${raw}`);
  }
}

/**
 * Parse a raw `cursor` query parameter into a non-negative integer. Returns
 * `null` when the parameter is absent.
 */
export function parseCursor(
  raw: string | null | undefined,
): Result<number | null, CursorParseError> {
  if (raw === null || raw === undefined) return ok(null);
  if (!/^(0|[1-9]\d*)$/.test(raw)) return err(new CursorParseError(raw));
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return err(new CursorParseError(raw));
  return ok(n);
}

/**
 * Return the cursor the server should emit in its response.
 *
 * - If the client's echoed cursor is absent or behind the current interval,
 *   return the current interval cursor (no jitter needed — the cache key is
 *   already advancing).
 * - If the client's echoed cursor is equal to or ahead of the current
 *   interval, the cache key is stuck and the server MUST return a strictly
 *   greater cursor. We pick a uniformly random number of intervals to add,
 *   bounded by `ceil(maxJitterSec / intervalSec)`.
 *
 * `rng` is injected to keep the function pure and testable. In production
 * it should be `Math.random`.
 */
export function advanceCursor(
  clientCursor: number | null,
  nowMs: number,
  rng: () => number,
  config?: CursorConfig,
): number {
  const resolved = resolve(config);
  const serverCursor = computeCursor(nowMs, config);

  if (clientCursor === null || clientCursor < serverCursor) {
    return serverCursor;
  }

  const maxIntervals = Math.max(
    1,
    Math.ceil(resolved.maxJitterSec / resolved.intervalSec),
  );
  const jitterIntervals = 1 + Math.floor(rng() * maxIntervals);
  return clientCursor + jitterIntervals;
}
