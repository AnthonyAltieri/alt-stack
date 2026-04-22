import { describe, it, expect } from "vitest";
import {
  computeCursor,
  parseCursor,
  advanceCursor,
  DEFAULT_CURSOR_EPOCH_MS,
  DEFAULT_CURSOR_INTERVAL_SEC,
  DEFAULT_MAX_JITTER_SEC,
  CursorParseError,
} from "./cursor.js";

describe("default constants match the spec (Section 8)", () => {
  it("epoch is 2024-10-09T00:00:00Z", () => {
    expect(new Date(DEFAULT_CURSOR_EPOCH_MS).toISOString()).toBe(
      "2024-10-09T00:00:00.000Z",
    );
  });

  it("interval is 20 seconds", () => {
    expect(DEFAULT_CURSOR_INTERVAL_SEC).toBe(20);
  });

  it("max jitter is 3600 seconds", () => {
    expect(DEFAULT_MAX_JITTER_SEC).toBe(3600);
  });
});

describe("computeCursor", () => {
  it("returns 0 at exactly the epoch", () => {
    expect(computeCursor(DEFAULT_CURSOR_EPOCH_MS)).toBe(0);
  });

  it("returns 0 for times before the epoch", () => {
    expect(computeCursor(DEFAULT_CURSOR_EPOCH_MS - 1_000_000)).toBe(0);
  });

  it("advances by 1 every interval", () => {
    const oneInterval = DEFAULT_CURSOR_INTERVAL_SEC * 1000;
    expect(computeCursor(DEFAULT_CURSOR_EPOCH_MS + oneInterval)).toBe(1);
    expect(computeCursor(DEFAULT_CURSOR_EPOCH_MS + oneInterval * 2)).toBe(2);
  });

  it("respects custom interval size", () => {
    expect(
      computeCursor(DEFAULT_CURSOR_EPOCH_MS + 1000, { intervalSec: 1 }),
    ).toBe(1);
    expect(
      computeCursor(DEFAULT_CURSOR_EPOCH_MS + 60_000, { intervalSec: 60 }),
    ).toBe(1);
  });

  it("floors fractional intervals", () => {
    const oneInterval = DEFAULT_CURSOR_INTERVAL_SEC * 1000;
    // 1.9 intervals past epoch → cursor 1
    expect(computeCursor(DEFAULT_CURSOR_EPOCH_MS + oneInterval * 1.9)).toBe(1);
  });
});

describe("parseCursor", () => {
  it("returns ok(null) when absent", () => {
    expect(parseCursor(null)).toEqual({ _tag: "Ok", value: null });
    expect(parseCursor(undefined)).toEqual({ _tag: "Ok", value: null });
  });

  it("accepts canonical non-negative integers", () => {
    expect(parseCursor("0")).toEqual({ _tag: "Ok", value: 0 });
    expect(parseCursor("1050")).toEqual({ _tag: "Ok", value: 1050 });
  });

  it.each([
    "+1",
    "-1",
    "01",
    "1.0",
    "1e3",
    "abc",
    "",
    " 1",
    "1 ",
  ])("rejects %j", (raw) => {
    const r = parseCursor(raw);
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error).toBeInstanceOf(CursorParseError);
  });
});

describe("advanceCursor", () => {
  const NOW = DEFAULT_CURSOR_EPOCH_MS + DEFAULT_CURSOR_INTERVAL_SEC * 1000 * 1000;
  // At NOW, serverCursor = 1000

  it("returns the server cursor when the client is absent", () => {
    const c = advanceCursor(null, NOW, () => 0);
    expect(c).toBe(1000);
  });

  it("returns the server cursor when the client is behind", () => {
    const c = advanceCursor(500, NOW, () => 0);
    expect(c).toBe(1000);
  });

  it("adds jitter when the client equals the server cursor", () => {
    // With maxJitterSec=3600 and intervalSec=20 → maxIntervals=180.
    // rng()=0 → jitterIntervals = 1, so cursor = 1000 + 1 = 1001
    const c = advanceCursor(1000, NOW, () => 0);
    expect(c).toBe(1001);
  });

  it("adds maximum jitter at the top of the rng range", () => {
    // rng() just below 1 → jitterIntervals = 1 + floor(0.9999 * 180) = 180
    const c = advanceCursor(1000, NOW, () => 0.9999);
    expect(c).toBe(1000 + 180);
  });

  it("adds jitter when the client is ahead of the server", () => {
    // Stuck-cache scenario. Client holds cursor=2000 while server thinks it's 1000.
    const c = advanceCursor(2000, NOW, () => 0);
    expect(c).toBe(2001);
  });

  it("jitter is always at least 1 (strictly greater than client cursor)", () => {
    for (let i = 0; i < 100; i++) {
      const rngVal = i / 100;
      const c = advanceCursor(1000, NOW, () => rngVal);
      expect(c).toBeGreaterThan(1000);
    }
  });

  it("respects a custom jitter cap", () => {
    const c = advanceCursor(1000, NOW, () => 0.9999, {
      intervalSec: 20,
      maxJitterSec: 60, // only 3 intervals of jitter
    });
    // jitterIntervals = 1 + floor(0.9999 * ceil(60/20)) = 1 + 2 = 3
    expect(c).toBe(1003);
  });
});
