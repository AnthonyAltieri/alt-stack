import { describe, it, expect } from "vitest";
import {
  flattenJsonAppend,
  parseAndFlattenJsonAppend,
  frameJsonRead,
  JsonFramingError,
} from "./json-mode.js";

describe("flattenJsonAppend", () => {
  it("wraps a non-array value in a single-message array", () => {
    expect(flattenJsonAppend({ event: "created" })).toEqual({
      _tag: "Ok",
      value: [{ event: "created" }],
    });
  });

  it("flattens one level of a top-level array", () => {
    expect(
      flattenJsonAppend([{ event: "a" }, { event: "b" }]),
    ).toEqual({ _tag: "Ok", value: [{ event: "a" }, { event: "b" }] });
  });

  it("only flattens one level — inner arrays are preserved", () => {
    // Spec example: [[1,2], [3,4]] stores two messages [1,2] and [3,4]
    expect(flattenJsonAppend([[1, 2], [3, 4]])).toEqual({
      _tag: "Ok",
      value: [[1, 2], [3, 4]],
    });
  });

  it("[[[1,2,3]]] stores one message: [[1,2,3]]", () => {
    expect(flattenJsonAppend([[[1, 2, 3]]])).toEqual({
      _tag: "Ok",
      value: [[[1, 2, 3]]],
    });
  });

  it("rejects an empty array", () => {
    const r = flattenJsonAppend([]);
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") {
      expect(r.error).toBeInstanceOf(JsonFramingError);
      expect(r.error.reason).toBe("empty-array");
    }
  });

  it("accepts primitive top-level values", () => {
    expect(flattenJsonAppend("hello")).toEqual({
      _tag: "Ok",
      value: ["hello"],
    });
    expect(flattenJsonAppend(42)).toEqual({ _tag: "Ok", value: [42] });
    expect(flattenJsonAppend(null)).toEqual({ _tag: "Ok", value: [null] });
    expect(flattenJsonAppend(true)).toEqual({ _tag: "Ok", value: [true] });
  });

  it("returns a defensive copy of the input array", () => {
    const input = [{ a: 1 }, { b: 2 }];
    const r = flattenJsonAppend(input);
    if (r._tag === "Ok") {
      expect(r.value).not.toBe(input);
      expect(r.value).toEqual(input);
    }
  });
});

describe("parseAndFlattenJsonAppend", () => {
  it("parses valid JSON and flattens", () => {
    expect(parseAndFlattenJsonAppend('[{"a":1},{"b":2}]')).toEqual({
      _tag: "Ok",
      value: [{ a: 1 }, { b: 2 }],
    });
  });

  it("rejects invalid JSON", () => {
    const r = parseAndFlattenJsonAppend("{not json");
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error.reason).toBe("invalid-json");
  });

  it("rejects empty arrays", () => {
    const r = parseAndFlattenJsonAppend("[]");
    expect(r._tag).toBe("Err");
    if (r._tag === "Err") expect(r.error.reason).toBe("empty-array");
  });

  it("rejects empty input (invalid JSON)", () => {
    expect(parseAndFlattenJsonAppend("")._tag).toBe("Err");
  });
});

describe("frameJsonRead", () => {
  it("renders messages as a JSON array", () => {
    expect(frameJsonRead([{ a: 1 }, { b: 2 }])).toBe('[{"a":1},{"b":2}]');
  });

  it("renders empty input as []", () => {
    expect(frameJsonRead([])).toBe("[]");
  });

  it("preserves inner arrays and primitives", () => {
    expect(frameJsonRead([[1, 2], "s", null, 3])).toBe('[[1,2],"s",null,3]');
  });
});
