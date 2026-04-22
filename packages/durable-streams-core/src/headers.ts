/**
 * HTTP header names defined by the Durable Streams Protocol.
 *
 * Header names are case-insensitive on the wire (RFC 9110). Values here use
 * the canonical casing from the protocol spec (Section 11.2).
 */

export const STREAM_TTL = "Stream-TTL";
export const STREAM_EXPIRES_AT = "Stream-Expires-At";
export const STREAM_SEQ = "Stream-Seq";
export const STREAM_CURSOR = "Stream-Cursor";
export const STREAM_NEXT_OFFSET = "Stream-Next-Offset";
export const STREAM_UP_TO_DATE = "Stream-Up-To-Date";
export const STREAM_CLOSED = "Stream-Closed";
export const STREAM_FORKED_FROM = "Stream-Forked-From";
export const STREAM_FORK_OFFSET = "Stream-Fork-Offset";

export const PRODUCER_ID = "Producer-Id";
export const PRODUCER_EPOCH = "Producer-Epoch";
export const PRODUCER_SEQ = "Producer-Seq";
export const PRODUCER_EXPECTED_SEQ = "Producer-Expected-Seq";
export const PRODUCER_RECEIVED_SEQ = "Producer-Received-Seq";

/**
 * Present on SSE responses when the stream's content type is not text/* or
 * application/json. Signals that `data:` event payloads are base64-encoded.
 * Lowercase per Section 5.8 of the protocol.
 */
export const SSE_DATA_ENCODING = "stream-sse-data-encoding";

/** The only accepted value for presence-style Stream-Closed / Stream-Up-To-Date headers. */
export const PRESENCE_TRUE = "true";
