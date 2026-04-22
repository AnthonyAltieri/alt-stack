import { describe, it, expect, beforeEach } from "vitest";
import { memoryStorage } from "./memory.js";
import type { Storage } from "./storage.js";

const JSON_CT = "application/json";
const toBytes = (s: string) => new TextEncoder().encode(s);
const fromBytes = (b: Uint8Array) => new TextDecoder().decode(b);

describe("memoryStorage — basic lifecycle", () => {
  let s: Storage;
  beforeEach(() => {
    s = memoryStorage();
  });

  it("create then head then delete", async () => {
    const created = await s.create("/a", { contentType: JSON_CT });
    expect(created._tag).toBe("Ok");
    if (created._tag === "Ok") {
      expect(created.value.created).toBe(true);
      expect(created.value.metadata.contentType).toBe(JSON_CT);
      expect(created.value.metadata.closed).toBe(false);
      expect(created.value.metadata.tailOffset).toBe("");
    }

    const head = await s.head("/a");
    expect(head._tag).toBe("Ok");

    const del = await s.delete("/a");
    expect(del._tag).toBe("Ok");

    const head2 = await s.head("/a");
    expect(head2._tag).toBe("Err");
  });

  it("create is idempotent when config matches", async () => {
    await s.create("/a", { contentType: JSON_CT });
    const r = await s.create("/a", { contentType: JSON_CT });
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") expect(r.value.created).toBe(false);
  });

  it("create rejects when config differs", async () => {
    await s.create("/a", { contentType: JSON_CT });
    const r = await s.create("/a", { contentType: "text/plain" });
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error._tag).toBe("StreamConfigMismatch");
  });

  it("delete is idempotent", async () => {
    await s.create("/a", { contentType: JSON_CT });
    expect((await s.delete("/a"))._tag).toBe("Ok");
    expect((await s.delete("/a"))._tag).toBe("Ok"); // no such stream; still ok
  });

  it("head of unknown stream returns StreamNotFound", async () => {
    const r = await s.head("/nope");
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error._tag).toBe("StreamNotFound");
  });
});

describe("memoryStorage — append + read", () => {
  let s: Storage;
  beforeEach(async () => {
    s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
  });

  it("appends and reads messages preserving order", async () => {
    const r1 = await s.append("/a", [toBytes('"one"'), toBytes('"two"')], {
      contentType: JSON_CT,
    });
    expect(r1._tag).toBe("Ok");
    const r2 = await s.append("/a", [toBytes('"three"')], {
      contentType: JSON_CT,
    });
    expect(r2._tag).toBe("Ok");

    const read = await s.read("/a", "", 1 << 20);
    expect(read._tag).toBe("Ok");
    if (read._tag === "Ok") {
      expect(read.value.messages.map(fromBytes)).toEqual([
        '"one"',
        '"two"',
        '"three"',
      ]);
      expect(read.value.upToDate).toBe(true);
      expect(read.value.closed).toBe(false);
    }
  });

  it("each appended message gets a strictly-increasing offset", async () => {
    await s.append("/a", [toBytes('"1"'), toBytes('"2"'), toBytes('"3"')], {
      contentType: JSON_CT,
    });
    const r = await s.read("/a", "", 1 << 20);
    if (r._tag !== "Ok") throw new Error("unreachable");
    const offsets = r.value.messages.length > 0 ? [r.value.startOffset] : [];
    // Read returns the last offset as nextOffset; to verify monotonic we
    // append one more and compare.
    const before = r.value.nextOffset;
    await s.append("/a", [toBytes('"4"')], { contentType: JSON_CT });
    const after = await s.read("/a", before, 1 << 20);
    if (after._tag !== "Ok") throw new Error("unreachable");
    expect(after.value.messages.length).toBe(1);
    expect(after.value.nextOffset > before).toBe(true);
    expect(offsets).toBeDefined();
  });

  it("read from offset returns only newer messages", async () => {
    const r1 = await s.append("/a", [toBytes('"first"')], {
      contentType: JSON_CT,
    });
    if (r1._tag !== "Ok") throw new Error("unreachable");
    const afterFirst = r1.value.nextOffset;
    await s.append("/a", [toBytes('"second"')], { contentType: JSON_CT });

    const r = await s.read("/a", afterFirst, 1 << 20);
    if (r._tag !== "Ok") throw new Error("unreachable");
    expect(r.value.messages.map(fromBytes)).toEqual(['"second"']);
  });

  it("rejects content-type mismatch", async () => {
    const r = await s.append("/a", [toBytes("bytes")], {
      contentType: "text/plain",
    });
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") {
      expect(r.error._tag).toBe("ContentTypeMismatch");
    }
  });

  it("atomic close: append and close in one call", async () => {
    const r = await s.append("/a", [toBytes('"final"')], {
      contentType: JSON_CT,
      close: true,
    });
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") expect(r.value.closed).toBe(true);

    const next = await s.append("/a", [toBytes('"late"')], {
      contentType: JSON_CT,
    });
    expect(next._tag).toBe("Err");
    if (next._tag === "Err") expect(next.error._tag).toBe("StreamClosed");
  });

  it("read on closed stream at tail reports closed: true", async () => {
    await s.append("/a", [toBytes('"x"')], {
      contentType: JSON_CT,
      close: true,
    });
    const r = await s.read("/a", "", 1 << 20);
    if (r._tag !== "Ok") throw new Error("unreachable");
    expect(r.value.closed).toBe(true);
    expect(r.value.upToDate).toBe(true);
  });
});

describe("memoryStorage — idempotent producers", () => {
  let s: Storage;
  beforeEach(async () => {
    s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
  });

  it("accepts a fresh (epoch=0, seq=0) and dedups a retry", async () => {
    const r1 = await s.appendWithProducer(
      "/a",
      [toBytes('"x"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT },
    );
    expect(r1._tag).toBe("Ok");
    if (r1._tag === "Ok") expect(r1.value.outcome).toBe("accepted");

    const r2 = await s.appendWithProducer(
      "/a",
      [toBytes('"x"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT },
    );
    expect(r2._tag).toBe("Ok");
    if (r2._tag === "Ok") expect(r2.value.outcome).toBe("duplicate");

    // Verify only one message was written
    const read = await s.read("/a", "", 1 << 20);
    if (read._tag !== "Ok") throw new Error("unreachable");
    expect(read.value.messages.length).toBe(1);
  });

  it("fences a stale epoch after a new one is established", async () => {
    await s.appendWithProducer(
      "/a",
      [toBytes('"a"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT },
    );
    // Producer restart bumps epoch
    await s.appendWithProducer(
      "/a",
      [toBytes('"b"')],
      { id: "w", epoch: 1, seq: 0 },
      { contentType: JSON_CT },
    );

    // Zombie from old epoch
    const r = await s.appendWithProducer(
      "/a",
      [toBytes('"z"')],
      { id: "w", epoch: 0, seq: 1 },
      { contentType: JSON_CT },
    );
    expect(r._tag).toBe("Err");
    if (r._tag === "Err" && r.error._tag === "StaleProducerEpoch") {
      expect(r.error.currentEpoch).toBe(1);
    } else {
      throw new Error("expected StaleProducerEpoch");
    }
  });

  it("rejects a sequence gap with expected/received", async () => {
    await s.appendWithProducer(
      "/a",
      [toBytes('"a"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT },
    );
    const r = await s.appendWithProducer(
      "/a",
      [toBytes('"c"')],
      { id: "w", epoch: 0, seq: 2 },
      { contentType: JSON_CT },
    );
    expect(r._tag).toBe("Err");
    if (r._tag === "Err" && r.error._tag === "ProducerSeqGap") {
      expect(r.error.expectedSeq).toBe(1);
      expect(r.error.receivedSeq).toBe(2);
    } else {
      throw new Error("expected ProducerSeqGap");
    }
  });

  it("duplicate after close returns 'duplicate', not 409", async () => {
    await s.appendWithProducer(
      "/a",
      [toBytes('"final"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT, close: true },
    );
    // Retry the same close request
    const r = await s.appendWithProducer(
      "/a",
      [toBytes('"final"')],
      { id: "w", epoch: 0, seq: 0 },
      { contentType: JSON_CT, close: true },
    );
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") {
      expect(r.value.outcome).toBe("duplicate");
      expect(r.value.closed).toBe(true);
    }
  });
});

describe("memoryStorage — live tailing", () => {
  it("waitForAppend returns immediately when data is present", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    await s.append("/a", [toBytes('"x"')], { contentType: JSON_CT });

    const ac = new AbortController();
    const r = await s.waitForAppend("/a", "", 1 << 20, 1000, ac.signal);
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") expect(r.value.messages.length).toBe(1);
  });

  it("waitForAppend returns on subsequent append", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    const head = await s.head("/a");
    if (head._tag !== "Ok") throw new Error("unreachable");

    const ac = new AbortController();
    const waitPromise = s.waitForAppend(
      "/a",
      head.value.tailOffset,
      1 << 20,
      5000,
      ac.signal,
    );

    // Append after a tick
    await new Promise((r) => setImmediate(r));
    await s.append("/a", [toBytes('"arrived"')], { contentType: JSON_CT });

    const r = await waitPromise;
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") {
      expect(r.value.messages.map(fromBytes)).toEqual(['"arrived"']);
    }
  });

  it("waitForAppend returns empty upToDate chunk on timeout", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    const ac = new AbortController();
    const r = await s.waitForAppend("/a", "", 1 << 20, 10, ac.signal);
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") {
      expect(r.value.messages.length).toBe(0);
      expect(r.value.upToDate).toBe(true);
    }
  });

  it("waitForAppend returns immediately when stream is closed at tail", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    await s.append("/a", [toBytes('"x"')], {
      contentType: JSON_CT,
      close: true,
    });
    const head = await s.head("/a");
    if (head._tag !== "Ok") throw new Error("unreachable");
    const ac = new AbortController();

    // Client requests past the tail; stream is already closed.
    const start = Date.now();
    const r = await s.waitForAppend(
      "/a",
      head.value.tailOffset,
      1 << 20,
      5000,
      ac.signal,
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(200); // should not wait for the full timeout
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok") expect(r.value.closed).toBe(true);
  });

  it("waitForAppend settles when signal aborts", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    const head = await s.head("/a");
    if (head._tag !== "Ok") throw new Error("unreachable");
    const ac = new AbortController();
    const p = s.waitForAppend("/a", head.value.tailOffset, 1 << 20, 60_000, ac.signal);
    await new Promise((r) => setImmediate(r));
    ac.abort();
    const r = await p;
    expect(r._tag).toBe("Ok"); // aborted → returns whatever is available
  });

  it("subscribe yields catch-up then live data", async () => {
    const s = memoryStorage();
    await s.create("/a", { contentType: JSON_CT });
    await s.append("/a", [toBytes('"a"'), toBytes('"b"')], {
      contentType: JSON_CT,
    });

    const ac = new AbortController();
    const collected: string[] = [];

    const task = (async () => {
      for await (const chunk of s.subscribe("/a", "", ac.signal)) {
        if (chunk._tag === "Ok") {
          for (const m of chunk.value.messages) collected.push(fromBytes(m));
          if (collected.length >= 3) {
            ac.abort();
            break;
          }
        }
      }
    })();

    // Let the catch-up chunk flow, then append live.
    await new Promise((r) => setImmediate(r));
    await s.append("/a", [toBytes('"c"')], { contentType: JSON_CT });
    await task;

    expect(collected).toEqual(['"a"', '"b"', '"c"']);
  });
});
