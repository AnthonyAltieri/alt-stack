import { describe, it, expect } from "vitest";
import { etagFor, formatEtagHeader, matchesIfNoneMatch } from "./etag.js";

describe("etagFor", () => {
  it("uses the canonical streamId:start:end format", () => {
    expect(
      etagFor({
        streamId: "abc",
        startOffset: "01JA",
        endOffset: "01JB",
        closed: false,
      }),
    ).toBe("abc:01JA:01JB");
  });

  it("appends ':c' for closed streams (Section 8)", () => {
    expect(
      etagFor({
        streamId: "abc",
        startOffset: "01JA",
        endOffset: "01JB",
        closed: true,
      }),
    ).toBe("abc:01JA:01JB:c");
  });

  it("open and closed tags for the same range are distinct", () => {
    const open = etagFor({
      streamId: "s",
      startOffset: "a",
      endOffset: "b",
      closed: false,
    });
    const closed = etagFor({
      streamId: "s",
      startOffset: "a",
      endOffset: "b",
      closed: true,
    });
    expect(open).not.toBe(closed);
  });
});

describe("formatEtagHeader", () => {
  it("wraps the tag in double quotes", () => {
    expect(formatEtagHeader("abc:01JA:01JB")).toBe('"abc:01JA:01JB"');
  });
});

describe("matchesIfNoneMatch", () => {
  const current = "abc:01JA:01JB";

  it("returns false for absent or empty header", () => {
    expect(matchesIfNoneMatch(current, null)).toBe(false);
    expect(matchesIfNoneMatch(current, undefined)).toBe(false);
    expect(matchesIfNoneMatch(current, "")).toBe(false);
    expect(matchesIfNoneMatch(current, "   ")).toBe(false);
  });

  it("returns true for wildcard '*'", () => {
    expect(matchesIfNoneMatch(current, "*")).toBe(true);
  });

  it("matches a single quoted tag", () => {
    expect(matchesIfNoneMatch(current, '"abc:01JA:01JB"')).toBe(true);
  });

  it("does not match a different tag", () => {
    expect(matchesIfNoneMatch(current, '"abc:01JA:01JC"')).toBe(false);
  });

  it("ignores the W/ weak marker (weak comparison per RFC 9110)", () => {
    expect(matchesIfNoneMatch(current, 'W/"abc:01JA:01JB"')).toBe(true);
  });

  it("handles comma-separated lists", () => {
    expect(
      matchesIfNoneMatch(current, '"other", "abc:01JA:01JB", "yet-another"'),
    ).toBe(true);
  });

  it("tolerates whitespace around entries", () => {
    expect(matchesIfNoneMatch(current, '  "abc:01JA:01JB"  ')).toBe(true);
  });

  it("rejects unquoted tag values", () => {
    // RFC 9110 requires ETag values to be quoted; an unquoted string is
    // syntactically invalid and must not be treated as a match.
    expect(matchesIfNoneMatch(current, "abc:01JA:01JB")).toBe(false);
  });

  it("distinguishes open and closed ETags", () => {
    // Exactly the case the closure-indicator suffix exists to defend against.
    const openTag = "s:a:b";
    const closedTag = "s:a:b:c";
    expect(matchesIfNoneMatch(closedTag, `"${openTag}"`)).toBe(false);
  });
});
