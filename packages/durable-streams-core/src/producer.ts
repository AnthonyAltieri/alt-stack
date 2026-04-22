/**
 * Idempotent producer state machine (Durable Streams Protocol Section 5.2.1).
 *
 * This is a pure reducer: given a stored {@link ProducerState} (or null for
 * a first-time producer) and an incoming `(epoch, seq)` pair, it returns a
 * {@link Decision} that tells the caller whether to accept, dedupe, or
 * reject — and with what response headers.
 *
 * Storage adapters are expected to invoke this function **inside** the same
 * atomic transaction that commits the append to the log, so that a crash
 * between "decision" and "persist" cannot produce duplicates. See the
 * "Atomicity Requirements" subsection of 5.2.1.
 *
 * Implementations MUST serialize calls per `(stream, producerId)` pair —
 * HTTP requests can arrive out-of-order and `seq=1` arriving before `seq=0`
 * would otherwise cause a spurious gap.
 */

/** Persistent per-producer state, serialized by the storage adapter. */
export interface ProducerState {
  readonly epoch: number;
  readonly lastSeq: number;
}

/**
 * Outcome of evaluating an incoming idempotent-producer append.
 *
 * Each variant's tag maps to a specific protocol response:
 *   - accept-new-epoch  → 200 OK (new epoch established)
 *   - accept            → 200 OK (data appended)
 *   - duplicate         → 204 No Content (idempotent success)
 *   - reject-stale-epoch → 403 Forbidden + Producer-Epoch: <current>
 *   - reject-bad-epoch-seq → 400 Bad Request (new epoch must start at seq=0)
 *   - reject-gap        → 409 Conflict + Producer-Expected-Seq / Producer-Received-Seq
 */
export type Decision =
  | { readonly tag: "accept-new-epoch"; readonly nextState: ProducerState }
  | { readonly tag: "accept"; readonly nextState: ProducerState }
  | { readonly tag: "duplicate" }
  | { readonly tag: "reject-stale-epoch"; readonly currentEpoch: number }
  | { readonly tag: "reject-bad-epoch-seq" }
  | {
      readonly tag: "reject-gap";
      readonly expectedSeq: number;
      readonly receivedSeq: number;
    };

/**
 * A producer with no prior state behaves as if its state were
 * `{ epoch: 0, lastSeq: -1 }`. This makes the bootstrap flow
 * `(epoch=0, seq=0)` fall cleanly into the "seq == lastSeq+1" branch, and
 * makes the auto-claim flow `(epoch=N, seq=0)` with `N > 0` fall into the
 * "new epoch established" branch — both as described in Section 5.2.1.
 */
const INITIAL_VIRTUAL_STATE: ProducerState = { epoch: 0, lastSeq: -1 };

export function decideProducerAppend(
  state: ProducerState | null,
  incoming: { readonly epoch: number; readonly seq: number },
): Decision {
  const current = state ?? INITIAL_VIRTUAL_STATE;

  if (incoming.epoch < current.epoch) {
    return { tag: "reject-stale-epoch", currentEpoch: current.epoch };
  }

  if (incoming.epoch > current.epoch) {
    if (incoming.seq !== 0) {
      return { tag: "reject-bad-epoch-seq" };
    }
    return {
      tag: "accept-new-epoch",
      nextState: { epoch: incoming.epoch, lastSeq: 0 },
    };
  }

  // Same epoch: sequence validation.
  if (incoming.seq <= current.lastSeq) {
    return { tag: "duplicate" };
  }
  if (incoming.seq === current.lastSeq + 1) {
    return {
      tag: "accept",
      nextState: { epoch: current.epoch, lastSeq: incoming.seq },
    };
  }
  return {
    tag: "reject-gap",
    expectedSeq: current.lastSeq + 1,
    receivedSeq: incoming.seq,
  };
}
