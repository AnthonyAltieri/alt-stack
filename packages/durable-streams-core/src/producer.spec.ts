import { describe, it, expect } from "vitest";
import { decideProducerAppend, type ProducerState } from "./producer.js";

describe("decideProducerAppend — bootstrap (null state)", () => {
  it("accepts (epoch=0, seq=0) as the initial append", () => {
    const d = decideProducerAppend(null, { epoch: 0, seq: 0 });
    expect(d.tag).toBe("accept");
    if (d.tag === "accept") {
      expect(d.nextState).toEqual({ epoch: 0, lastSeq: 0 });
    }
  });

  it("auto-claim: accepts (epoch=N, seq=0) with N>0 as new-epoch", () => {
    const d = decideProducerAppend(null, { epoch: 5, seq: 0 });
    expect(d.tag).toBe("accept-new-epoch");
    if (d.tag === "accept-new-epoch") {
      expect(d.nextState).toEqual({ epoch: 5, lastSeq: 0 });
    }
  });

  it("rejects (epoch=N, seq>0) with N>0 as bad-epoch-seq", () => {
    const d = decideProducerAppend(null, { epoch: 5, seq: 3 });
    expect(d.tag).toBe("reject-bad-epoch-seq");
  });

  it("rejects (epoch=0, seq>0) with no prior state as a seq gap", () => {
    // A fresh producer that skips seq 0 is indistinguishable from a client
    // bug; the spec says the gap-response is the right answer — it tells
    // them the expected next seq is 0.
    const d = decideProducerAppend(null, { epoch: 0, seq: 5 });
    expect(d.tag).toBe("reject-gap");
    if (d.tag === "reject-gap") {
      expect(d.expectedSeq).toBe(0);
      expect(d.receivedSeq).toBe(5);
    }
  });
});

describe("decideProducerAppend — same epoch", () => {
  const state: ProducerState = { epoch: 3, lastSeq: 10 };

  it("accepts seq = lastSeq + 1", () => {
    const d = decideProducerAppend(state, { epoch: 3, seq: 11 });
    expect(d.tag).toBe("accept");
    if (d.tag === "accept") {
      expect(d.nextState).toEqual({ epoch: 3, lastSeq: 11 });
    }
  });

  it("treats seq == lastSeq as duplicate (idempotent success)", () => {
    const d = decideProducerAppend(state, { epoch: 3, seq: 10 });
    expect(d.tag).toBe("duplicate");
    if (d.tag === "duplicate") expect(d.currentState).toEqual(state);
  });

  it("treats seq < lastSeq as duplicate (out-of-order retry)", () => {
    const d = decideProducerAppend(state, { epoch: 3, seq: 5 });
    expect(d.tag).toBe("duplicate");
    if (d.tag === "duplicate") {
      // currentState echoes the highest accepted seq so callers can emit
      // Producer-Seq response headers without re-reading storage.
      expect(d.currentState).toEqual(state);
    }
  });

  it("rejects seq > lastSeq + 1 as a gap, echoing expected/received", () => {
    const d = decideProducerAppend(state, { epoch: 3, seq: 15 });
    expect(d.tag).toBe("reject-gap");
    if (d.tag === "reject-gap") {
      expect(d.expectedSeq).toBe(11);
      expect(d.receivedSeq).toBe(15);
    }
  });
});

describe("decideProducerAppend — epoch transitions", () => {
  const state: ProducerState = { epoch: 3, lastSeq: 10 };

  it("fences a stale epoch (zombie) with current epoch", () => {
    const d = decideProducerAppend(state, { epoch: 2, seq: 11 });
    expect(d.tag).toBe("reject-stale-epoch");
    if (d.tag === "reject-stale-epoch") {
      expect(d.currentEpoch).toBe(3);
    }
  });

  it("accepts a new epoch at seq=0 and resets lastSeq", () => {
    const d = decideProducerAppend(state, { epoch: 4, seq: 0 });
    expect(d.tag).toBe("accept-new-epoch");
    if (d.tag === "accept-new-epoch") {
      expect(d.nextState).toEqual({ epoch: 4, lastSeq: 0 });
    }
  });

  it("rejects a new epoch that doesn't start at seq=0", () => {
    const d = decideProducerAppend(state, { epoch: 4, seq: 7 });
    expect(d.tag).toBe("reject-bad-epoch-seq");
  });

  it("stale-epoch check takes precedence over seq check", () => {
    // Even if the zombie sends a seemingly valid next-seq within its old
    // epoch, we must reject by epoch, not silently accept as duplicate.
    const d = decideProducerAppend(state, { epoch: 2, seq: 11 });
    expect(d.tag).toBe("reject-stale-epoch");
  });
});

describe("decideProducerAppend — pipelining and retry safety", () => {
  it("accepting then re-delivering the same request returns duplicate", () => {
    const s0: ProducerState = { epoch: 0, lastSeq: 0 };
    const d1 = decideProducerAppend(s0, { epoch: 0, seq: 1 });
    expect(d1.tag).toBe("accept");
    if (d1.tag !== "accept") throw new Error("unreachable");

    // Client retries seq=1 after a transient network failure
    const d2 = decideProducerAppend(d1.nextState, { epoch: 0, seq: 1 });
    expect(d2.tag).toBe("duplicate");
  });

  it("pipelined (0,1,2,3) in order all accept and advance lastSeq", () => {
    let s: ProducerState | null = null;
    const seq = [0, 1, 2, 3];
    for (const i of seq) {
      const d = decideProducerAppend(s, { epoch: 0, seq: i });
      if (d.tag === "accept" || d.tag === "accept-new-epoch") {
        s = d.nextState;
      } else {
        throw new Error(`expected accept, got ${d.tag} at seq=${i}`);
      }
    }
    expect(s).toEqual({ epoch: 0, lastSeq: 3 });
  });

  it("is pure — the same inputs always produce the same decision", () => {
    const s: ProducerState = { epoch: 2, lastSeq: 5 };
    const input = { epoch: 2, seq: 6 } as const;
    const d1 = decideProducerAppend(s, input);
    const d2 = decideProducerAppend(s, input);
    expect(d1).toEqual(d2);
  });

  it("does not mutate the input state", () => {
    const s: ProducerState = { epoch: 2, lastSeq: 5 };
    const snapshot = { ...s };
    decideProducerAppend(s, { epoch: 2, seq: 6 });
    expect(s).toEqual(snapshot);
  });
});
