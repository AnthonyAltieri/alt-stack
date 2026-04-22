import { TaggedError } from "@alt-stack/result";

/**
 * The complete vocabulary of protocol-defined errors.
 *
 * Each class's `_tag` and constructor arguments carry exactly the fields the
 * server adapter needs to render the correct HTTP status code and response
 * headers. `statusFor()` maps each tag to its wire status.
 *
 * This union is shared by `@alt-stack/durable-streams-server`, storage
 * adapters, and the client, so that the error surface is consistent across
 * every layer.
 */

// -- 400 Bad Request ----------------------------------------------------------

export class InvalidOffset extends TaggedError {
  readonly _tag = "InvalidOffset";
  constructor(public readonly raw: string) {
    super(`Invalid offset: ${raw}`);
  }
}

export class InvalidHeader extends TaggedError {
  readonly _tag = "InvalidHeader";
  constructor(
    public readonly header: string,
    public readonly reason: string,
  ) {
    super(`Invalid ${header}: ${reason}`);
  }
}

export class EmptyJsonArray extends TaggedError {
  readonly _tag = "EmptyJsonArray";
  constructor() {
    super("empty JSON arrays are not a valid append body");
  }
}

export class InvalidJson extends TaggedError {
  readonly _tag = "InvalidJson";
  constructor(public readonly reason: string) {
    super(`Append body is not valid JSON: ${reason}`);
  }
}

export class EmptyAppendBody extends TaggedError {
  readonly _tag = "EmptyAppendBody";
  constructor() {
    super(
      "POST with empty body is only valid when Stream-Closed: true is present",
    );
  }
}

export class ConflictingTtlAndExpiry extends TaggedError {
  readonly _tag = "ConflictingTtlAndExpiry";
  constructor() {
    super("Stream-TTL and Stream-Expires-At cannot both be supplied");
  }
}

export class ForkOffsetBeyondTail extends TaggedError {
  readonly _tag = "ForkOffsetBeyondTail";
  constructor() {
    super("Stream-Fork-Offset exceeds the source stream's current tail");
  }
}

export class BadProducerEpochSeq extends TaggedError {
  readonly _tag = "BadProducerEpochSeq";
  constructor() {
    super("a new Producer-Epoch must start at Producer-Seq = 0");
  }
}

// -- 403 Forbidden ------------------------------------------------------------

export class StaleProducerEpoch extends TaggedError {
  readonly _tag = "StaleProducerEpoch";
  constructor(public readonly currentEpoch: number) {
    super(`producer epoch is stale; current epoch is ${currentEpoch}`);
  }
}

// -- 404 Not Found ------------------------------------------------------------

export class StreamNotFound extends TaggedError {
  readonly _tag = "StreamNotFound";
  constructor(public readonly streamUrl: string) {
    super(`stream not found: ${streamUrl}`);
  }
}

export class SourceStreamNotFound extends TaggedError {
  readonly _tag = "SourceStreamNotFound";
  constructor(public readonly sourcePath: string) {
    super(`fork source stream not found: ${sourcePath}`);
  }
}

// -- 405 Method Not Allowed ---------------------------------------------------

export class MethodNotAllowed extends TaggedError {
  readonly _tag = "MethodNotAllowed";
  constructor(public readonly method: string) {
    super(`method not allowed: ${method}`);
  }
}

// -- 409 Conflict -------------------------------------------------------------

/**
 * Returned when a client attempts to append to a closed stream without
 * `Stream-Closed: true`. The response MUST carry `Stream-Closed: true` and
 * `Stream-Next-Offset: <finalOffset>` per Section 5.2.
 */
export class StreamClosed extends TaggedError {
  readonly _tag = "StreamClosed";
  constructor(public readonly finalOffset: string) {
    super("stream is closed; no further appends permitted");
  }
}

/** PUT to an existing URL whose configuration differs from the request. */
export class StreamConfigMismatch extends TaggedError {
  readonly _tag = "StreamConfigMismatch";
  constructor() {
    super("a stream already exists at this URL with different configuration");
  }
}

export class ContentTypeMismatch extends TaggedError {
  readonly _tag = "ContentTypeMismatch";
  constructor(public readonly expected: string) {
    super(`content type mismatch; stream expects ${expected}`);
  }
}

export class StreamSeqRegression extends TaggedError {
  readonly _tag = "StreamSeqRegression";
  constructor() {
    super("Stream-Seq regressed; must be strictly increasing");
  }
}

export class ProducerSeqGap extends TaggedError {
  readonly _tag = "ProducerSeqGap";
  constructor(
    public readonly expectedSeq: number,
    public readonly receivedSeq: number,
  ) {
    super(
      `producer sequence gap: expected ${expectedSeq}, received ${receivedSeq}`,
    );
  }
}

export class ForkTargetInUse extends TaggedError {
  readonly _tag = "ForkTargetInUse";
  constructor() {
    super("a stream already exists at the fork target URL");
  }
}

export class ForkSourceSoftDeleted extends TaggedError {
  readonly _tag = "ForkSourceSoftDeleted";
  constructor() {
    super("fork source is soft-deleted and cannot be forked from");
  }
}

// -- 410 Gone -----------------------------------------------------------------

export class StreamGone extends TaggedError {
  readonly _tag = "StreamGone";
  constructor() {
    super("stream is soft-deleted");
  }
}

export class OffsetBeforeRetention extends TaggedError {
  readonly _tag = "OffsetBeforeRetention";
  constructor() {
    super("requested offset is before the earliest retained position");
  }
}

// -- 413 Payload Too Large ----------------------------------------------------

export class PayloadTooLarge extends TaggedError {
  readonly _tag = "PayloadTooLarge";
  constructor() {
    super("request body exceeds server limits");
  }
}

// -- 429 Too Many Requests ----------------------------------------------------

export class RateLimited extends TaggedError {
  readonly _tag = "RateLimited";
  constructor() {
    super("rate limit exceeded");
  }
}

// -- 501 Not Implemented ------------------------------------------------------

export class NotImplemented extends TaggedError {
  readonly _tag = "NotImplemented";
  constructor(public readonly operation: string) {
    super(`operation not implemented: ${operation}`);
  }
}

/** Discriminated union of every protocol-defined error. */
export type DurableStreamError =
  | InvalidOffset
  | InvalidHeader
  | EmptyJsonArray
  | InvalidJson
  | EmptyAppendBody
  | ConflictingTtlAndExpiry
  | ForkOffsetBeyondTail
  | BadProducerEpochSeq
  | StaleProducerEpoch
  | StreamNotFound
  | SourceStreamNotFound
  | MethodNotAllowed
  | StreamClosed
  | StreamConfigMismatch
  | ContentTypeMismatch
  | StreamSeqRegression
  | ProducerSeqGap
  | ForkTargetInUse
  | ForkSourceSoftDeleted
  | StreamGone
  | OffsetBeforeRetention
  | PayloadTooLarge
  | RateLimited
  | NotImplemented;

/** Map any {@link DurableStreamError} to its HTTP status code. */
export function statusFor(err: DurableStreamError): number {
  switch (err._tag) {
    case "InvalidOffset":
    case "InvalidHeader":
    case "EmptyJsonArray":
    case "InvalidJson":
    case "EmptyAppendBody":
    case "ConflictingTtlAndExpiry":
    case "ForkOffsetBeyondTail":
    case "BadProducerEpochSeq":
      return 400;

    case "StaleProducerEpoch":
      return 403;

    case "StreamNotFound":
    case "SourceStreamNotFound":
      return 404;

    case "MethodNotAllowed":
      return 405;

    case "StreamClosed":
    case "StreamConfigMismatch":
    case "ContentTypeMismatch":
    case "StreamSeqRegression":
    case "ProducerSeqGap":
    case "ForkTargetInUse":
    case "ForkSourceSoftDeleted":
      return 409;

    case "StreamGone":
    case "OffsetBeforeRetention":
      return 410;

    case "PayloadTooLarge":
      return 413;

    case "RateLimited":
      return 429;

    case "NotImplemented":
      return 501;
  }
}
