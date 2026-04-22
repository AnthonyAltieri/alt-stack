import { describe, it, expect } from "vitest";
import {
  OFFSET_BEGINNING,
  OFFSET_NOW,
  MAX_OFFSET_LENGTH,
  isValidOffset,
  isSentinel,
  compareOffsets,
  isReservedSentinelLiteral,
} from "./offset.js";

describe("isValidOffset", () => {
  it("accepts ordinary ULID-like tokens", () => {
    expect(isValidOffset("01JA3M5Z7X9K0Q8P5Y4R1C3N8B")).toBe(true);
  });

  it("accepts sentinels -1 and now", () => {
    expect(isValidOffset(OFFSET_BEGINNING)).toBe(true);
    expect(isValidOffset(OFFSET_NOW)).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(isValidOffset(null)).toBe(false);
    expect(isValidOffset(undefined)).toBe(false);
    expect(isValidOffset(123)).toBe(false);
    expect(isValidOffset({})).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(isValidOffset("")).toBe(false);
  });

  it.each([",", "&", "=", "?", "/"])(
    "rejects offsets containing reserved URL char %j",
    (ch) => {
      expect(isValidOffset(`abc${ch}def`)).toBe(false);
    },
  );

  it("rejects offsets longer than 256 chars", () => {
    expect(isValidOffset("x".repeat(MAX_OFFSET_LENGTH))).toBe(true);
    expect(isValidOffset("x".repeat(MAX_OFFSET_LENGTH + 1))).toBe(false);
  });

  it("is case-sensitive (no normalization)", () => {
    expect(isValidOffset("AbC")).toBe(true);
    expect(isValidOffset("abc")).toBe(true);
  });
});

describe("isSentinel", () => {
  it("returns 'start' for -1", () => {
    expect(isSentinel("-1")).toBe("start");
  });

  it("returns 'now' for now", () => {
    expect(isSentinel("now")).toBe("now");
  });

  it("is case-sensitive: 'NOW' is not a sentinel", () => {
    expect(isSentinel("NOW")).toBeNull();
    expect(isSentinel("Now")).toBeNull();
  });

  it("returns null for concrete offsets", () => {
    expect(isSentinel("01JA3M5Z7X9K0Q8P5Y4R1C3N8B")).toBeNull();
    expect(isSentinel("0")).toBeNull();
    expect(isSentinel("-2")).toBeNull();
  });
});

describe("compareOffsets", () => {
  it("orders lexicographically", () => {
    expect(compareOffsets("a", "b")).toBeLessThan(0);
    expect(compareOffsets("b", "a")).toBeGreaterThan(0);
    expect(compareOffsets("a", "a")).toBe(0);
  });

  it("orders ULID-like timestamps correctly", () => {
    const earlier = "01JA3M5Z7X9K0Q8P5Y4R1C3N8B";
    const later = "01JA3M5Z7X9K0Q8P5Y4R1C3N9A";
    expect(compareOffsets(earlier, later)).toBeLessThan(0);
  });

  it("byte-wise, not numeric: '10' < '2'", () => {
    // Protocol specifies byte-wise comparison (Section 5.2 Stream-Seq rules
    // and Section 6 offset rules). Do NOT fall back to numeric comparison.
    expect(compareOffsets("10", "2")).toBeLessThan(0);
  });

  it("is a valid sort comparator", () => {
    const unsorted = ["c", "a", "b"];
    const sorted = [...unsorted].sort(compareOffsets);
    expect(sorted).toEqual(["a", "b", "c"]);
  });
});

describe("isReservedSentinelLiteral", () => {
  it("flags -1 and now", () => {
    expect(isReservedSentinelLiteral("-1")).toBe(true);
    expect(isReservedSentinelLiteral("now")).toBe(true);
  });

  it("does not flag concrete offsets", () => {
    expect(isReservedSentinelLiteral("01JA3M5Z7X9K0Q8P5Y4R1C3N8B")).toBe(false);
  });
});
