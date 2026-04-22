import { type Result } from "@alt-stack/result";
import {
  type DurableStreamError,
  type ProducerState,
} from "@alt-stack/durable-streams-core";

/**
 * Contract that storage adapter authors implement. The runtime in this
 * package turns HTTP requests into calls against a `Storage`; adapters are
 * the only place I/O and transactions live.
 *
 * **Canonical offsets:**
 * - The runtime resolves protocol sentinels (`-1`, `now`) to concrete offsets
 *   before calling storage — implementations never see sentinel strings.
 * - The empty string `""` is the canonical "before any offset" marker,
 *   lex-smaller than any real offset.
 * - Implementations MUST generate offsets that are strictly increasing and
 *   lex-sortable (ULID is the common choice).
 *
 * **Atomicity:**
 * - `appendWithProducer` MUST commit the producer-state update and the log
 *   append in a single transaction, per Section 5.2.1's atomicity requirement.
 * - The runtime serializes calls per `(streamId, producerId)` for in-process
 *   correctness, but implementations MUST NOT rely on that alone in a
 *   multi-process deployment — use DB-level constraints.
 *
 * **Messages, not bytes:**
 * - Both `append` and `read` operate on `Uint8Array[]` — an ordered list of
 *   discrete messages. For `application/json` streams, each message is a
 *   single JSON value's UTF-8 encoding (flattened by the runtime). For other
 *   content types each `append` call contains exactly one message.
 * - Each message receives its own offset; a batch of N messages produces N
 *   offsets with the last one returned as `nextOffset`.
 */
export interface Storage {
  /**
   * Create a stream, possibly atomically closed and/or forked from another
   * same-server stream. Returns an outcome indicating whether the call
   * created a new stream (→ 201) or observed a matching existing one (→ 200).
   */
  create(
    streamUrl: string,
    cfg: CreateConfig,
    initialMessages?: readonly Uint8Array[],
  ): Promise<Result<CreateOutcome, DurableStreamError>>;

  /** Fetch metadata without touching data. Used by HEAD and `offset=now`. */
  head(streamUrl: string): Promise<Result<StreamMetadata, DurableStreamError>>;

  /**
   * Delete a stream. Soft-deletes when there are active forks (refcount > 0);
   * hard-deletes otherwise. Deleting an already-deleted stream succeeds
   * idempotently.
   */
  delete(streamUrl: string): Promise<Result<DeleteOutcome, DurableStreamError>>;

  /**
   * Append one or more messages to a stream. If `opts.close` is true, the
   * stream atomically transitions to closed after the messages are written.
   *
   * Content-type matching is the storage's responsibility — return
   * `ContentTypeMismatch` when `opts.contentType` disagrees with the stream's
   * configured type.
   */
  append(
    streamUrl: string,
    messages: readonly Uint8Array[],
    opts: AppendOpts,
  ): Promise<Result<AppendOutcome, DurableStreamError>>;

  /**
   * Atomic idempotent-producer append. The adapter evaluates the producer
   * state machine (see `decideProducerAppend` in `@alt-stack/durable-streams-core`)
   * inside the same transaction that commits the append. On success, returns
   * both the append outcome and the new producer state to echo back as
   * response headers.
   */
  appendWithProducer(
    streamUrl: string,
    messages: readonly Uint8Array[],
    producer: ProducerRequest,
    opts: AppendOpts,
  ): Promise<Result<ProducerAppendOutcome, DurableStreamError>>;

  /**
   * Read up to `maxBytes` of messages starting at `fromOffset`. `fromOffset`
   * is either a concrete offset previously returned by this storage, or the
   * empty string `""` meaning "from the start". Sentinels are never passed.
   */
  read(
    streamUrl: string,
    fromOffset: string,
    maxBytes: number,
  ): Promise<Result<ReadChunk, DurableStreamError>>;

  /**
   * Block until new data is available beyond `fromOffset`, the stream closes,
   * the timeout elapses, or the signal aborts.
   *
   * On timeout with no new data, return an "empty, up-to-date" chunk
   * (`messages.length === 0`, `upToDate: true`).
   *
   * Implementations MUST honor the abort signal and return promptly — a
   * disconnected client should not hold a DB connection.
   */
  waitForAppend(
    streamUrl: string,
    fromOffset: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<Result<ReadChunk, DurableStreamError>>;

  /**
   * Subscribe to live data. Yields chunks that together reconstruct the
   * stream from `fromOffset` forward. Terminates when the signal aborts or
   * the stream is closed and the final chunk has been yielded.
   *
   * Implementations typically emit a single catch-up chunk (or several for
   * large backlogs) followed by one chunk per newly-appended batch.
   */
  subscribe(
    streamUrl: string,
    fromOffset: string,
    signal: AbortSignal,
  ): AsyncIterable<Result<ReadChunk, DurableStreamError>>;
}

// ---------------------------------------------------------------------------
// Supporting types
// ---------------------------------------------------------------------------

export interface CreateConfig {
  readonly contentType: string;
  readonly ttlSeconds?: number;
  readonly expiresAt?: Date;
  /** When true, the stream is created in the closed state. */
  readonly closed?: boolean;
  /** Path of a same-server source stream (fork creation). */
  readonly forkedFrom?: string;
  /** Divergence offset in the source stream. Defaults to source's tail. */
  readonly forkOffset?: string;
}

export interface StreamMetadata {
  /** Internal opaque stream id. Stable across the stream's lifetime. Used for ETag. */
  readonly streamId: string;
  readonly contentType: string;
  /** Tail offset — the empty string `""` when the stream has no data yet. */
  readonly tailOffset: string;
  readonly closed: boolean;
  readonly ttlSeconds?: number;
  readonly expiresAt?: Date;
  readonly forkedFrom?: string;
  readonly forkOffset?: string;
}

export interface CreateOutcome {
  /** True when a new stream was created; false on idempotent match. */
  readonly created: boolean;
  readonly metadata: StreamMetadata;
}

export interface DeleteOutcome {
  /** True when the stream had active forks and was soft-deleted. */
  readonly softDeleted: boolean;
}

export interface AppendOpts {
  readonly contentType: string;
  /** When true, atomically close the stream after appending. */
  readonly close?: boolean;
}

export interface AppendOutcome {
  readonly nextOffset: string;
  readonly closed: boolean;
}

export interface ProducerRequest {
  readonly id: string;
  readonly epoch: number;
  readonly seq: number;
}

/**
 * Combined outcome of an idempotent-producer append.
 *
 * The `outcome` discriminant mirrors the `Decision` tags from
 * `decideProducerAppend`:
 * - `"accepted"` / `"accepted-new-epoch"`: data was written. Runtime returns 200.
 * - `"duplicate"`: request matched a previous append; no write. Runtime returns 204.
 *
 * Sequence gaps, stale epochs, and bad-epoch-seq errors are surfaced as
 * `Err(DurableStreamError)` instead.
 */
export type ProducerAppendOutcome =
  | {
      readonly outcome: "accepted";
      readonly nextOffset: string;
      readonly closed: boolean;
      readonly newState: ProducerState;
    }
  | {
      readonly outcome: "accepted-new-epoch";
      readonly nextOffset: string;
      readonly closed: boolean;
      readonly newState: ProducerState;
    }
  | {
      readonly outcome: "duplicate";
      readonly nextOffset: string;
      readonly closed: boolean;
      readonly currentState: ProducerState;
    };

export interface ReadChunk {
  /** Internal opaque stream id — needed so the runtime can build ETags. */
  readonly streamId: string;
  /** Offset of the first message in this chunk, or `""` if `messages` is empty. */
  readonly startOffset: string;
  /**
   * The offset clients should request next. Equals the tail when `upToDate`
   * is true; otherwise it marks where the chunk ended mid-stream.
   */
  readonly nextOffset: string;
  /** Ordered messages. For `application/json` each entry is one JSON value's UTF-8 bytes. */
  readonly messages: readonly Uint8Array[];
  /** True iff `nextOffset` equals the stream's current tail. */
  readonly upToDate: boolean;
  /**
   * True iff the stream is closed AND `nextOffset` equals the stream's final
   * offset. This is the canonical EOF signal for the catch-up / long-poll /
   * SSE code paths.
   */
  readonly closed: boolean;
}
