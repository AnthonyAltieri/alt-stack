import { describe, it, expect } from "vitest";
import {
  parseStreamTtl,
  parseStreamExpiresAt,
  parseStreamClosed,
  parseStreamUpToDate,
  parseStreamSeq,
  parseProducerHeaders,
  parseOffsetQuery,
  HeaderParseError,
} from "./parsers.js";
import { OFFSET_BEGINNING, OFFSET_NOW } from "./offset.js";

describe("parseStreamTtl", () => {
  it("returns ok(null) when absent", () => {
    expect(parseStreamTtl(null)).toEqual({ _tag: "Ok", value: null });
    expect(parseStreamTtl(undefined)).toEqual({ _tag: "Ok", value: null });
  });

  it("accepts 0", () => {
    expect(parseStreamTtl("0")).toEqual({ _tag: "Ok", value: 0 });
  });

  it("accepts canonical decimal integers", () => {
    expect(parseStreamTtl("3600")).toEqual({ _tag: "Ok", value: 3600 });
    expect(parseStreamTtl("1")).toEqual({ _tag: "Ok", value: 1 });
  });

  it.each([
    ["+3600", "plus sign"],
    ["-3600", "minus sign"],
    ["03600", "leading zero"],
    ["3600.0", "decimal point"],
    ["3.6e3", "scientific notation"],
    ["abc", "non-numeric"],
    ["", "empty"],
    [" 3600", "leading whitespace"],
    ["3600 ", "trailing whitespace"],
  ])("rejects %j (%s)", (raw) => {
    const r = parseStreamTtl(raw);
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error).toBeInstanceOf(HeaderParseError);
  });

  it("rejects values exceeding 2^53-1", () => {
    const tooBig = "9007199254740993"; // 2^53 + 1
    const r = parseStreamTtl(tooBig);
    expect(r._tag).toBe("Err");
  });
});

describe("parseStreamExpiresAt", () => {
  it("returns ok(null) when absent", () => {
    expect(parseStreamExpiresAt(null)).toEqual({ _tag: "Ok", value: null });
  });

  it("accepts RFC 3339 with Z offset", () => {
    const r = parseStreamExpiresAt("2025-01-15T10:30:00Z");
    expect(r._tag).toBe("Ok");
    if (r._tag === "Ok" && r.value !== null) {
      expect(r.value.toISOString()).toBe("2025-01-15T10:30:00.000Z");
    }
  });

  it("accepts RFC 3339 with numeric offset", () => {
    const r = parseStreamExpiresAt("2025-01-15T10:30:00+02:00");
    expect(r._tag).toBe("Ok");
  });

  it("accepts fractional seconds", () => {
    const r = parseStreamExpiresAt("2025-01-15T10:30:00.123Z");
    expect(r._tag).toBe("Ok");
  });

  it.each([
    "2025-01-15",
    "2025-01-15 10:30:00Z",
    "2025-01-15T10:30:00",
    "not-a-date",
    "",
  ])("rejects non-RFC-3339 value %j", (raw) => {
    expect(parseStreamExpiresAt(raw)._tag).toBe("Err");
  });

  it("rejects syntactically-valid but unreal dates", () => {
    // February 30th passes the regex but Date constructor coerces.
    // We rely on regex strictness + Date's NaN check.
    const r = parseStreamExpiresAt("2025-13-01T00:00:00Z");
    expect(r._tag).toBe("Err");
  });
});

describe("parseStreamClosed", () => {
  it("returns true only for exact 'true' case-insensitive", () => {
    expect(parseStreamClosed("true")).toBe(true);
    expect(parseStreamClosed("TRUE")).toBe(true);
    expect(parseStreamClosed("True")).toBe(true);
  });

  it("returns false for everything else (per Section 4.1)", () => {
    expect(parseStreamClosed("false")).toBe(false);
    expect(parseStreamClosed("1")).toBe(false);
    expect(parseStreamClosed("yes")).toBe(false);
    expect(parseStreamClosed("")).toBe(false);
    expect(parseStreamClosed(null)).toBe(false);
    expect(parseStreamClosed(undefined)).toBe(false);
    expect(parseStreamClosed("truee")).toBe(false);
  });

  it("never throws — the protocol forbids rejecting non-true values", () => {
    expect(() => parseStreamClosed("garbage")).not.toThrow();
    expect(() => parseStreamUpToDate("garbage")).not.toThrow();
  });
});

describe("parseStreamSeq", () => {
  it("returns ok(null) when absent", () => {
    expect(parseStreamSeq(null)).toEqual({ _tag: "Ok", value: null });
  });

  it("accepts opaque strings", () => {
    expect(parseStreamSeq("abc")).toEqual({ _tag: "Ok", value: "abc" });
    expect(parseStreamSeq("01JA3M5Z")).toEqual({ _tag: "Ok", value: "01JA3M5Z" });
  });

  it("rejects empty string", () => {
    expect(parseStreamSeq("")._tag).toBe("Err");
  });
});

describe("parseProducerHeaders", () => {
  it("returns ok(null) when all three are absent", () => {
    expect(
      parseProducerHeaders({ id: null, epoch: null, seq: null }),
    ).toEqual({ _tag: "Ok", value: null });
    expect(
      parseProducerHeaders({ id: undefined, epoch: undefined, seq: undefined }),
    ).toEqual({ _tag: "Ok", value: null });
  });

  it("accepts a complete triplet", () => {
    const r = parseProducerHeaders({
      id: "worker-1",
      epoch: "0",
      seq: "42",
    });
    expect(r).toEqual({
      _tag: "Ok",
      value: { id: "worker-1", epoch: 0, seq: 42 },
    });
  });

  it("rejects partial triplets (any one missing)", () => {
    expect(
      parseProducerHeaders({ id: "x", epoch: "0", seq: null })._tag,
    ).toBe("Err");
    expect(
      parseProducerHeaders({ id: "x", epoch: null, seq: "0" })._tag,
    ).toBe("Err");
    expect(
      parseProducerHeaders({ id: null, epoch: "0", seq: "0" })._tag,
    ).toBe("Err");
  });

  it("rejects empty Producer-Id", () => {
    const r = parseProducerHeaders({ id: "", epoch: "0", seq: "0" });
    expect(r._tag).toBe("Err");
  });

  it("rejects non-integer epoch or seq", () => {
    expect(
      parseProducerHeaders({ id: "x", epoch: "1.5", seq: "0" })._tag,
    ).toBe("Err");
    expect(
      parseProducerHeaders({ id: "x", epoch: "0", seq: "-1" })._tag,
    ).toBe("Err");
  });

  it("rejects epoch/seq beyond 2^53-1", () => {
    const r = parseProducerHeaders({
      id: "x",
      epoch: "9007199254740993",
      seq: "0",
    });
    expect(r._tag).toBe("Err");
  });
});

describe("parseOffsetQuery", () => {
  it("defaults to OFFSET_BEGINNING when absent", () => {
    expect(parseOffsetQuery(null)).toEqual({
      _tag: "Ok",
      value: OFFSET_BEGINNING,
    });
    expect(parseOffsetQuery(undefined)).toEqual({
      _tag: "Ok",
      value: OFFSET_BEGINNING,
    });
  });

  it("passes through sentinel values", () => {
    expect(parseOffsetQuery(OFFSET_BEGINNING)).toEqual({
      _tag: "Ok",
      value: OFFSET_BEGINNING,
    });
    expect(parseOffsetQuery(OFFSET_NOW)).toEqual({
      _tag: "Ok",
      value: OFFSET_NOW,
    });
  });

  it("passes through concrete offsets", () => {
    expect(parseOffsetQuery("01JA3M5Z7X9K0Q8P5Y4R1C3N8B")).toEqual({
      _tag: "Ok",
      value: "01JA3M5Z7X9K0Q8P5Y4R1C3N8B",
    });
  });

  it("rejects malformed offsets", () => {
    expect(parseOffsetQuery("abc/def")._tag).toBe("Err");
    expect(parseOffsetQuery("")._tag).toBe("Err");
  });
});
