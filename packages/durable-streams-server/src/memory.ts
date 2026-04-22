import { ok, err, type Result } from "@alt-stack/result";
import { EventEmitter } from "node:events";
import {
  decideProducerAppend,
  type ProducerState,
  type DurableStreamError,
  StreamNotFound,
  StreamClosed,
  ContentTypeMismatch,
  StreamConfigMismatch,
  StaleProducerEpoch,
  BadProducerEpochSeq,
  ProducerSeqGap,
  NotImplemented,
} from "@alt-stack/durable-streams-core";

import type {
  Storage,
  CreateConfig,
  ProducerAppendOutcome,
  ReadChunk,
  StreamMetadata,
} from "./storage.js";

interface Message {
  readonly offset: string;
  readonly bytes: Uint8Array;
}

interface StreamState {
  readonly streamId: string;
  readonly streamUrl: string;
  readonly contentType: string;
  readonly ttlSeconds?: number;
  readonly expiresAt?: Date;
  closed: boolean;
  readonly messages: Message[];
  readonly producers: Map<string, ProducerState>;
  readonly notifier: EventEmitter;
}

const DEFAULT_READ_MAX_BYTES = 1 << 20; // 1 MiB

/**
 * In-memory reference `Storage`. Suitable for tests, local development, and
 * as the reference implementation that the wire protocol's behavior is
 * anchored against.
 *
 * Notable scope limits (v0):
 *   - No fork support. `create` with `forkedFrom` returns `NotImplemented`.
 *   - No soft-delete / refcount. `delete` always hard-deletes.
 *   - No TTL enforcement. The fields are stored but streams never expire.
 *   - No pagination window on reads beyond a single size cap.
 */
export function memoryStorage(): Storage {
  const streams = new Map<string, StreamState>();
  let offsetCounter = 0n;
  let streamIdCounter = 0;

  const nextOffset = (): string => {
    // Millis-precision timestamp + monotonic counter. 13-digit ms pad ensures
    // lex ordering works for any time within this millennium; the counter
    // prevents collisions within a single millisecond.
    const ms = Date.now().toString().padStart(13, "0");
    offsetCounter += 1n;
    const ctr = offsetCounter.toString().padStart(9, "0");
    return `${ms}_${ctr}`;
  };

  const tail = (s: StreamState): string =>
    s.messages.length === 0 ? "" : s.messages[s.messages.length - 1]!.offset;

  const toMetadata = (s: StreamState): StreamMetadata => {
    const md: {
      streamId: string;
      contentType: string;
      tailOffset: string;
      closed: boolean;
      ttlSeconds?: number;
      expiresAt?: Date;
    } = {
      streamId: s.streamId,
      contentType: s.contentType,
      tailOffset: tail(s),
      closed: s.closed,
    };
    if (s.ttlSeconds !== undefined) md.ttlSeconds = s.ttlSeconds;
    if (s.expiresAt !== undefined) md.expiresAt = s.expiresAt;
    return md;
  };

  const configsMatch = (s: StreamState, cfg: CreateConfig): boolean => {
    if (s.contentType !== cfg.contentType) return false;
    if ((s.ttlSeconds ?? null) !== (cfg.ttlSeconds ?? null)) return false;
    const leftExp = s.expiresAt?.getTime() ?? null;
    const rightExp = cfg.expiresAt?.getTime() ?? null;
    if (leftExp !== rightExp) return false;
    if (s.closed !== (cfg.closed ?? false)) return false;
    return true;
  };

  const startIndex = (s: StreamState, fromOffset: string): number => {
    if (fromOffset === "") return 0;
    // First message with offset > fromOffset.
    for (let i = 0; i < s.messages.length; i++) {
      if (s.messages[i]!.offset > fromOffset) return i;
    }
    return s.messages.length;
  };

  const makeChunk = (
    s: StreamState,
    fromOffset: string,
    maxBytes: number,
  ): ReadChunk => {
    const start = startIndex(s, fromOffset);
    const picked: Message[] = [];
    let bytes = 0;
    for (let i = start; i < s.messages.length; i++) {
      const m = s.messages[i]!;
      if (picked.length > 0 && bytes + m.bytes.length > maxBytes) break;
      picked.push(m);
      bytes += m.bytes.length;
    }
    const endIdx = start + picked.length;
    const upToDate = endIdx === s.messages.length;
    const nextOffset =
      picked.length > 0 ? picked[picked.length - 1]!.offset : fromOffset;
    return {
      streamId: s.streamId,
      startOffset: picked.length > 0 ? picked[0]!.offset : "",
      nextOffset,
      messages: picked.map((m) => m.bytes),
      upToDate,
      closed: s.closed && upToDate,
    };
  };

  const newStreamId = (): string => `mem-${++streamIdCounter}`;

  // -----------------------------------------------------------------------
  // Interface implementation
  // -----------------------------------------------------------------------

  const doWaitForAppend = async (
    streamUrl: string,
    fromOffset: string,
    maxBytes: number,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<Result<ReadChunk, DurableStreamError>> => {
    const s = streams.get(streamUrl);
    if (!s) return err(new StreamNotFound(streamUrl));

    const immediate = makeChunk(s, fromOffset, maxBytes);
    if (immediate.messages.length > 0 || immediate.closed) {
      return ok(immediate);
    }
    if (signal.aborted) return ok(immediate);

    return new Promise<Result<ReadChunk, DurableStreamError>>((resolve) => {
      let settled = false;

      const finish = (chunk: ReadChunk) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        s.notifier.off("update", onUpdate);
        signal.removeEventListener("abort", onAbort);
        resolve(ok(chunk));
      };

      const onUpdate = () => finish(makeChunk(s, fromOffset, maxBytes));
      const onAbort = () => finish(makeChunk(s, fromOffset, maxBytes));
      const onTimeout = () => finish(makeChunk(s, fromOffset, maxBytes));

      const timer = setTimeout(onTimeout, timeoutMs);
      s.notifier.on("update", onUpdate);
      signal.addEventListener("abort", onAbort);
    });
  };

  return {
    async create(streamUrl, cfg, initialMessages) {
      if (cfg.forkedFrom !== undefined) {
        return err(new NotImplemented("fork creation"));
      }
      const existing = streams.get(streamUrl);
      if (existing) {
        if (configsMatch(existing, cfg)) {
          return ok({ created: false, metadata: toMetadata(existing) });
        }
        return err(new StreamConfigMismatch());
      }
      const state: StreamState = {
        streamId: newStreamId(),
        streamUrl,
        contentType: cfg.contentType,
        ttlSeconds: cfg.ttlSeconds,
        expiresAt: cfg.expiresAt,
        closed: cfg.closed ?? false,
        messages: [],
        producers: new Map(),
        notifier: new EventEmitter(),
      };
      if (initialMessages) {
        for (const m of initialMessages) {
          state.messages.push({ offset: nextOffset(), bytes: m });
        }
      }
      streams.set(streamUrl, state);
      return ok({ created: true, metadata: toMetadata(state) });
    },

    async head(streamUrl) {
      const s = streams.get(streamUrl);
      if (!s) return err(new StreamNotFound(streamUrl));
      return ok(toMetadata(s));
    },

    async delete(streamUrl) {
      streams.delete(streamUrl);
      return ok({ softDeleted: false });
    },

    async append(streamUrl, messages, opts) {
      const s = streams.get(streamUrl);
      if (!s) return err(new StreamNotFound(streamUrl));
      // Spec §5.2 error precedence: closed → content-type → seq.
      if (s.closed) {
        return err(new StreamClosed(tail(s)));
      }
      if (s.contentType !== opts.contentType) {
        return err(new ContentTypeMismatch(s.contentType));
      }
      for (const m of messages) {
        s.messages.push({ offset: nextOffset(), bytes: m });
      }
      if (opts.close) s.closed = true;
      s.notifier.emit("update");
      return ok({ nextOffset: tail(s), closed: s.closed });
    },

    async appendWithProducer(streamUrl, messages, producer, opts) {
      const s = streams.get(streamUrl);
      if (!s) return err(new StreamNotFound(streamUrl));

      const state = s.producers.get(producer.id) ?? null;
      const decision = decideProducerAppend(state, {
        epoch: producer.epoch,
        seq: producer.seq,
      });

      switch (decision.tag) {
        case "reject-stale-epoch":
          return err(new StaleProducerEpoch(decision.currentEpoch));
        case "reject-bad-epoch-seq":
          return err(new BadProducerEpochSeq());
        case "reject-gap":
          return err(
            new ProducerSeqGap(decision.expectedSeq, decision.receivedSeq),
          );
        case "duplicate":
          // Idempotent success: do not re-check content-type or closed state;
          // the original call already passed those. `decision.currentState`
          // carries the highest accepted (epoch, seq) for this producer.
          return ok({
            outcome: "duplicate",
            nextOffset: tail(s),
            closed: s.closed,
            currentState: decision.currentState,
          });
        case "accept":
        case "accept-new-epoch": {
          // Spec §5.2 error precedence: closed → content-type → seq.
          if (s.closed) {
            return err(new StreamClosed(tail(s)));
          }
          if (s.contentType !== opts.contentType) {
            return err(new ContentTypeMismatch(s.contentType));
          }
          for (const m of messages) {
            s.messages.push({ offset: nextOffset(), bytes: m });
          }
          if (opts.close) s.closed = true;
          s.producers.set(producer.id, decision.nextState);
          s.notifier.emit("update");
          return ok({
            outcome:
              decision.tag === "accept-new-epoch"
                ? "accepted-new-epoch"
                : "accepted",
            nextOffset: tail(s),
            closed: s.closed,
            newState: decision.nextState,
          } satisfies ProducerAppendOutcome);
        }
      }
    },

    async read(streamUrl, fromOffset, maxBytes) {
      const s = streams.get(streamUrl);
      if (!s) return err(new StreamNotFound(streamUrl));
      return ok(makeChunk(s, fromOffset, maxBytes));
    },

    waitForAppend(streamUrl, fromOffset, maxBytes, timeoutMs, signal) {
      return doWaitForAppend(streamUrl, fromOffset, maxBytes, timeoutMs, signal);
    },

    subscribe(streamUrl, fromOffset, signal): AsyncIterable<
      Result<ReadChunk, DurableStreamError>
    > {
      async function* iterate(): AsyncIterable<
        Result<ReadChunk, DurableStreamError>
      > {
        const s = streams.get(streamUrl);
        if (!s) {
          yield err(new StreamNotFound(streamUrl));
          return;
        }
        let cursor = fromOffset;
        // Drain catch-up first.
        while (!signal.aborted) {
          const chunk = makeChunk(s, cursor, DEFAULT_READ_MAX_BYTES);
          yield ok(chunk);
          if (chunk.closed) return;
          cursor = chunk.nextOffset;
          if (chunk.upToDate) break;
        }
        // Then tail live.
        while (!signal.aborted) {
          const r = await doWaitForAppend(
            streamUrl,
            cursor,
            DEFAULT_READ_MAX_BYTES,
            30_000,
            signal,
          );
          if (r._tag === "Err") {
            yield r;
            return;
          }
          const chunk = r.value;
          if (chunk.messages.length > 0) {
            yield ok(chunk);
            cursor = chunk.nextOffset;
          }
          if (chunk.closed) return;
          if (signal.aborted) return;
        }
      }
      return iterate();
    },
  };
}

/**
 * Discards a memory storage instance. Primarily useful for tests that want
 * to be explicit about cleanup, though dropping the reference works too.
 */
export function isMemoryStorage(s: Storage): boolean {
  // Cheap identity check used by tests.
  return (s as unknown as { __memoryStorage?: boolean }).__memoryStorage === true;
}
