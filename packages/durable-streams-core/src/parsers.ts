import { ok, err, TaggedError, type Result } from "@alt-stack/result";
import { isValidOffset, OFFSET_BEGINNING } from "./offset.js";

/**
 * Raised when a protocol-defined header fails syntactic validation. Callers
 * should map this to `400 Bad Request` per the spec's error precedence.
 */
export class HeaderParseError extends TaggedError {
  readonly _tag = "HeaderParseError";
  constructor(
    public readonly header: string,
    public readonly reason: string,
    public readonly raw: string | null | undefined,
  ) {
    super(`Invalid ${header}: ${reason}`);
  }
}

/** Maximum safe integer per JavaScript / the protocol's 2^53-1 cap. */
const MAX_SAFE_INT = Number.MAX_SAFE_INTEGER; // 2^53 - 1

/**
 * Strict non-negative integer: either "0" or a digit 1-9 followed by more
 * digits. No leading zeros, plus signs, decimals, or scientific notation.
 * Matches the Stream-TTL spec in Section 5.1 exactly.
 */
const STRICT_NON_NEG_INT = /^(0|[1-9]\d*)$/;

/**
 * RFC 3339 date-time. Requires a `T` separator between date and time, seconds
 * precision, optional fractional seconds, and either `Z` or a numeric offset.
 * Intentionally stricter than `new Date(...)`, which accepts many formats
 * that are not RFC 3339.
 */
const RFC_3339 =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function parseStrictNonNegInt(
  raw: string,
  header: string,
): Result<number, HeaderParseError> {
  if (!STRICT_NON_NEG_INT.test(raw)) {
    return err(
      new HeaderParseError(
        header,
        "must be a non-negative integer in decimal notation",
        raw,
      ),
    );
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    return err(new HeaderParseError(header, "exceeds 2^53-1", raw));
  }
  return ok(n);
}

/**
 * Parse `Stream-TTL` (Section 5.1). Returns `null` if the header is absent.
 * The protocol forbids non-canonical representations like `+3600`, `03600`,
 * `3600.0`, or `3.6e3`.
 */
export function parseStreamTtl(
  raw: string | null | undefined,
): Result<number | null, HeaderParseError> {
  if (raw === null || raw === undefined) return ok(null);
  return parseStrictNonNegInt(raw, "Stream-TTL");
}

/**
 * Parse `Stream-Expires-At` (Section 5.1) as an RFC 3339 timestamp. Returns
 * `null` if the header is absent.
 */
export function parseStreamExpiresAt(
  raw: string | null | undefined,
): Result<Date | null, HeaderParseError> {
  if (raw === null || raw === undefined) return ok(null);
  if (!RFC_3339.test(raw)) {
    return err(
      new HeaderParseError("Stream-Expires-At", "not a valid RFC 3339 timestamp", raw),
    );
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return err(
      new HeaderParseError("Stream-Expires-At", "does not represent a real date", raw),
    );
  }
  return ok(d);
}

/**
 * Parse `Stream-Closed` per Section 4.1.
 *
 * Only the exact value `true` (case-insensitive) counts as closure intent.
 * Any other value — including `false`, `yes`, `1`, `""`, or absent — is
 * treated as if the header were absent. Servers MUST NOT reject on non-`true`
 * values; this is a robustness requirement against clients that set default
 * `Content-Type` / similar headers.
 */
export function parseStreamClosed(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return false;
  return raw.toLowerCase() === "true";
}

/**
 * Parse `Stream-Up-To-Date`. Same presence-style semantics as `Stream-Closed`.
 */
export function parseStreamUpToDate(raw: string | null | undefined): boolean {
  return parseStreamClosed(raw);
}

/**
 * Stream-Seq values are opaque strings compared byte-wise (Section 5.2). No
 * format validation is possible beyond "non-empty if provided."
 */
export function parseStreamSeq(
  raw: string | null | undefined,
): Result<string | null, HeaderParseError> {
  if (raw === null || raw === undefined) return ok(null);
  if (raw.length === 0) {
    return err(new HeaderParseError("Stream-Seq", "must not be empty", raw));
  }
  return ok(raw);
}

export interface ProducerHeaders {
  readonly id: string;
  readonly epoch: number;
  readonly seq: number;
}

/**
 * Parse the Producer-Id / Producer-Epoch / Producer-Seq triplet (Section 5.2.1).
 *
 * All three headers MUST be provided together or not at all. Partial sets
 * result in a parse error (→ 400 Bad Request).
 *
 * Returns `null` when all three are absent (non-idempotent producer request).
 */
export function parseProducerHeaders(headers: {
  id: string | null | undefined;
  epoch: string | null | undefined;
  seq: string | null | undefined;
}): Result<ProducerHeaders | null, HeaderParseError> {
  const present = [headers.id, headers.epoch, headers.seq].filter(
    (v) => v !== null && v !== undefined,
  );
  if (present.length === 0) return ok(null);
  if (present.length !== 3) {
    return err(
      new HeaderParseError(
        "Producer-*",
        "Producer-Id, Producer-Epoch, and Producer-Seq must all be provided together",
        null,
      ),
    );
  }

  const idRaw = headers.id as string;
  const epochRaw = headers.epoch as string;
  const seqRaw = headers.seq as string;

  if (idRaw.length === 0) {
    return err(new HeaderParseError("Producer-Id", "must be a non-empty string", idRaw));
  }

  const epochResult = parseStrictNonNegInt(epochRaw, "Producer-Epoch");
  if (epochResult._tag === "Err") return epochResult;

  const seqResult = parseStrictNonNegInt(seqRaw, "Producer-Seq");
  if (seqResult._tag === "Err") return seqResult;

  return ok({ id: idRaw, epoch: epochResult.value, seq: seqResult.value });
}

/**
 * Parse the `offset` query parameter for read operations (Section 5.6).
 *
 * If absent, defaults to `-1` (stream beginning) per Section 5.6. Callers
 * that require an explicit offset (long-poll, SSE per Sections 5.7 / 5.8)
 * must check for absence themselves before calling this.
 *
 * Sentinel values are returned as-is; callers are responsible for resolving
 * them against the stream's current state.
 */
export function parseOffsetQuery(
  raw: string | null | undefined,
): Result<string, HeaderParseError> {
  if (raw === null || raw === undefined) return ok(OFFSET_BEGINNING);
  if (!isValidOffset(raw)) {
    return err(new HeaderParseError("offset", "malformed offset token", raw));
  }
  return ok(raw);
}

export { MAX_SAFE_INT as PRODUCER_MAX_INT };
