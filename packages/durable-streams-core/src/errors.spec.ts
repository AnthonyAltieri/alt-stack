import { describe, it, expect } from "vitest";
import {
  InvalidOffset,
  InvalidHeader,
  EmptyJsonArray,
  InvalidJson,
  EmptyAppendBody,
  ConflictingTtlAndExpiry,
  ForkOffsetBeyondTail,
  BadProducerEpochSeq,
  StaleProducerEpoch,
  StreamNotFound,
  SourceStreamNotFound,
  MethodNotAllowed,
  StreamClosed,
  StreamConfigMismatch,
  ContentTypeMismatch,
  StreamSeqRegression,
  ProducerSeqGap,
  ForkTargetInUse,
  ForkSourceSoftDeleted,
  StreamGone,
  OffsetBeforeRetention,
  PayloadTooLarge,
  RateLimited,
  NotImplemented,
  statusFor,
  type DurableStreamError,
} from "./errors.js";

describe("tagged errors extend Error and set _tag", () => {
  it("each error's name equals its _tag", () => {
    const err = new StreamNotFound("/v1/s/abc");
    expect(err).toBeInstanceOf(Error);
    expect(err._tag).toBe("StreamNotFound");
    expect(err.name).toBe("StreamNotFound");
  });

  it("carries structured fields for downstream handlers", () => {
    const closed = new StreamClosed("01JA3M5Z");
    expect(closed.finalOffset).toBe("01JA3M5Z");

    const stale = new StaleProducerEpoch(5);
    expect(stale.currentEpoch).toBe(5);

    const gap = new ProducerSeqGap(3, 7);
    expect(gap.expectedSeq).toBe(3);
    expect(gap.receivedSeq).toBe(7);

    const bad = new InvalidHeader("Stream-TTL", "leading zero");
    expect(bad.header).toBe("Stream-TTL");
    expect(bad.reason).toBe("leading zero");

    const ct = new ContentTypeMismatch("application/json");
    expect(ct.expected).toBe("application/json");
  });
});

describe("statusFor covers the protocol's status-code table", () => {
  const cases: readonly [DurableStreamError, number][] = [
    [new InvalidOffset("x/y"), 400],
    [new InvalidHeader("Stream-TTL", "nope"), 400],
    [new EmptyJsonArray(), 400],
    [new InvalidJson("unexpected token"), 400],
    [new EmptyAppendBody(), 400],
    [new ConflictingTtlAndExpiry(), 400],
    [new ForkOffsetBeyondTail(), 400],
    [new BadProducerEpochSeq(), 400],

    [new StaleProducerEpoch(5), 403],

    [new StreamNotFound("/s"), 404],
    [new SourceStreamNotFound("/s"), 404],

    [new MethodNotAllowed("PATCH"), 405],

    [new StreamClosed("01JA3M5Z"), 409],
    [new StreamConfigMismatch(), 409],
    [new ContentTypeMismatch("application/json"), 409],
    [new StreamSeqRegression(), 409],
    [new ProducerSeqGap(3, 7), 409],
    [new ForkTargetInUse(), 409],
    [new ForkSourceSoftDeleted(), 409],

    [new StreamGone(), 410],
    [new OffsetBeforeRetention(), 410],

    [new PayloadTooLarge(), 413],
    [new RateLimited(), 429],
    [new NotImplemented("POST"), 501],
  ];

  it.each(cases)("%s → %i", (err, status) => {
    expect(statusFor(err)).toBe(status);
  });

  it("is exhaustive — adding a new variant without updating statusFor is a type error", () => {
    // This test exists for documentation: the TypeScript compiler enforces
    // exhaustiveness via the union return type. If a new DurableStreamError
    // is added without a case, `statusFor` will fail to type-check.
    expect(typeof statusFor).toBe("function");
  });
});
