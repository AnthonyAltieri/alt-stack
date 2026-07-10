/**
 * ETag helpers for the Durable Streams Protocol.
 *
 * Section 5.6 defines the canonical opaque tag as
 *
 *     {internal_stream_id}:{start_offset}:{end_offset}
 *
 * Section 8 requires that ETags vary with closure status and recommends a
 * `:c` suffix to mark closed streams, so that a client holding an ETag for
 * the pre-closure tail does not receive a `304 Not Modified` after closure
 * and miss the EOF signal.
 *
 * On the wire ETag values are always quoted per RFC 9110:
 *
 *     ETag: "abc:d1:d2:c"
 *
 * We return the raw tag identifier from {@link etagFor}; callers use
 * {@link formatEtagHeader} to produce the wire form. {@link matchesIfNoneMatch}
 * takes the raw `If-None-Match` header value and handles quoting, weak-tag
 * markers (`W/`), and the wildcard `*`.
 */

export interface EtagParams {
  readonly streamId: string;
  readonly startOffset: string;
  readonly endOffset: string;
  readonly closed: boolean;
}

/** Generate the raw (unquoted) ETag identifier for a catch-up response. */
export function etagFor(params: EtagParams): string {
  const base = `${params.streamId}:${params.startOffset}:${params.endOffset}`;
  return params.closed ? `${base}:c` : base;
}

/** Wrap a raw tag in double quotes for the wire. */
export function formatEtagHeader(rawTag: string): string {
  return `"${rawTag}"`;
}

/**
 * Weak-comparison match per RFC 9110 §13.1.2.
 *
 * Returns `true` when `currentEtag` (raw, unquoted) appears in the
 * `If-None-Match` header value. Handles:
 *   - `*` wildcard
 *   - comma-separated tag lists
 *   - quoted tags (`"abc"`)
 *   - weak markers (`W/"abc"` — stripped, since weak comparison ignores the flag)
 *   - surrounding whitespace
 *
 * The comparison is byte-for-byte on the raw tag identifier.
 */
export function matchesIfNoneMatch(
  currentEtag: string,
  ifNoneMatch: string | null | undefined,
): boolean {
  if (ifNoneMatch === null || ifNoneMatch === undefined) return false;
  const trimmed = ifNoneMatch.trim();
  if (trimmed === "") return false;
  if (trimmed === "*") return true;

  for (const part of trimmed.split(",")) {
    const tag = stripWeakAndQuotes(part.trim());
    if (tag !== null && tag === currentEtag) return true;
  }
  return false;
}

function stripWeakAndQuotes(value: string): string | null {
  let v = value;
  if (v.startsWith("W/")) v = v.slice(2);
  if (v.length < 2) return null;
  if (v.charCodeAt(0) !== 0x22 /* " */) return null;
  if (v.charCodeAt(v.length - 1) !== 0x22) return null;
  return v.slice(1, -1);
}
