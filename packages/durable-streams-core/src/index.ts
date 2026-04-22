// Header name constants (Section 11.2 + 5.2.1 + 5.8)
export {
  STREAM_TTL,
  STREAM_EXPIRES_AT,
  STREAM_SEQ,
  STREAM_CURSOR,
  STREAM_NEXT_OFFSET,
  STREAM_UP_TO_DATE,
  STREAM_CLOSED,
  STREAM_FORKED_FROM,
  STREAM_FORK_OFFSET,
  PRODUCER_ID,
  PRODUCER_EPOCH,
  PRODUCER_SEQ,
  PRODUCER_EXPECTED_SEQ,
  PRODUCER_RECEIVED_SEQ,
  SSE_DATA_ENCODING,
  PRESENCE_TRUE,
} from "./headers.js";

// Offsets (Section 6)
export {
  OFFSET_BEGINNING,
  OFFSET_NOW,
  MAX_OFFSET_LENGTH,
  isValidOffset,
  isSentinel,
  compareOffsets,
  isReservedSentinelLiteral,
} from "./offset.js";

// Header and query parsers
export {
  HeaderParseError,
  parseStreamTtl,
  parseStreamExpiresAt,
  parseStreamClosed,
  parseStreamUpToDate,
  parseStreamSeq,
  parseProducerHeaders,
  parseOffsetQuery,
  PRODUCER_MAX_INT,
} from "./parsers.js";
export type { ProducerHeaders } from "./parsers.js";

// JSON-mode framing (Section 7.1)
export {
  JsonFramingError,
  flattenJsonAppend,
  parseAndFlattenJsonAppend,
  frameJsonRead,
} from "./json-mode.js";

// Idempotent producer state machine (Section 5.2.1)
export { decideProducerAppend } from "./producer.js";
export type { ProducerState, Decision } from "./producer.js";

// Cursor math (Section 8)
export {
  DEFAULT_CURSOR_EPOCH_MS,
  DEFAULT_CURSOR_INTERVAL_SEC,
  DEFAULT_MAX_JITTER_SEC,
  CursorParseError,
  computeCursor,
  parseCursor,
  advanceCursor,
} from "./cursor.js";
export type { CursorConfig } from "./cursor.js";

// Tagged errors + status-code mapping
export {
  InvalidOffset,
  InvalidHeader,
  EmptyJsonArray,
  InvalidJson,
  EmptyAppendBody,
  ConflictingTtlAndExpiry,
  ForkOffsetBeyondTail,
  BadProducerEpochSeq,
  StaleProducerEpoch,
  StreamNotFound,
  SourceStreamNotFound,
  MethodNotAllowed,
  StreamClosed,
  StreamConfigMismatch,
  ContentTypeMismatch,
  StreamSeqRegression,
  ProducerSeqGap,
  ForkTargetInUse,
  ForkSourceSoftDeleted,
  StreamGone,
  OffsetBeforeRetention,
  PayloadTooLarge,
  RateLimited,
  NotImplemented,
  statusFor,
} from "./errors.js";
export type { DurableStreamError } from "./errors.js";

// ETag helpers (Sections 5.6 + 8)
export { etagFor, formatEtagHeader, matchesIfNoneMatch } from "./etag.js";
export type { EtagParams } from "./etag.js";
