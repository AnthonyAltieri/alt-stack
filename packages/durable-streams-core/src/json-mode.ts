import { ok, err, TaggedError, type Result } from "@alt-stack/result";

/**
 * Raised when a JSON-mode append body fails the framing rules of Section 7.1.
 * Callers should map all variants to `400 Bad Request`.
 */
export class JsonFramingError extends TaggedError {
  readonly _tag = "JsonFramingError";
  constructor(
    public readonly reason: "invalid-json" | "empty-array",
    message: string,
  ) {
    super(message);
  }
}

/**
 * Flatten a parsed JSON-mode append body into an array of messages per
 * Section 7.1 "Array Flattening for Batch Operations".
 *
 * - A top-level JSON array is flattened exactly one level: each element
 *   becomes a separate message.
 * - A top-level non-array value becomes a single message.
 * - A top-level empty array (`[]`) is rejected. Empty arrays in appends
 *   are treated as likely client bugs per the protocol.
 *
 * Examples:
 *
 *   flattenJsonAppend({ event: "a" })       → [{ event: "a" }]
 *   flattenJsonAppend([{ a: 1 }, { b: 2 }]) → [{ a: 1 }, { b: 2 }]
 *   flattenJsonAppend([[1, 2], [3, 4]])     → [[1, 2], [3, 4]]    // one level only
 *   flattenJsonAppend([[[1, 2, 3]]])        → [[[1, 2, 3]]]       // outer stripped → [[1,2,3]] wrapped
 *   flattenJsonAppend([])                   → Err(empty-array)
 */
export function flattenJsonAppend(
  parsed: unknown,
): Result<unknown[], JsonFramingError> {
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      return err(
        new JsonFramingError(
          "empty-array",
          "empty JSON arrays are not a valid append body",
        ),
      );
    }
    return ok([...parsed]);
  }
  return ok([parsed]);
}

/**
 * Parse a raw JSON body and flatten it per {@link flattenJsonAppend}. This is
 * the typical entry point for `application/json` POST append handlers.
 */
export function parseAndFlattenJsonAppend(
  raw: string,
): Result<unknown[], JsonFramingError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    const reason =
      e instanceof Error ? e.message : "failed to parse append body as JSON";
    return err(new JsonFramingError("invalid-json", reason));
  }
  return flattenJsonAppend(parsed);
}

/**
 * Render a sequence of JSON-mode messages as a single JSON array body, per
 * Section 7.1 "Response Format".
 *
 * An empty input produces the canonical empty array body `"[]"`.
 */
export function frameJsonRead(messages: readonly unknown[]): string {
  return JSON.stringify(messages);
}
