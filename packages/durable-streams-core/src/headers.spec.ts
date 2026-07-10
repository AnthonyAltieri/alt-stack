import { describe, it, expect } from "vitest";
import * as H from "./headers.js";

describe("header name constants", () => {
  it("exports every Stream-* name from the spec (Section 11.2)", () => {
    expect(H.STREAM_TTL).toBe("Stream-TTL");
    expect(H.STREAM_EXPIRES_AT).toBe("Stream-Expires-At");
    expect(H.STREAM_SEQ).toBe("Stream-Seq");
    expect(H.STREAM_CURSOR).toBe("Stream-Cursor");
    expect(H.STREAM_NEXT_OFFSET).toBe("Stream-Next-Offset");
    expect(H.STREAM_UP_TO_DATE).toBe("Stream-Up-To-Date");
    expect(H.STREAM_CLOSED).toBe("Stream-Closed");
    expect(H.STREAM_FORKED_FROM).toBe("Stream-Forked-From");
    expect(H.STREAM_FORK_OFFSET).toBe("Stream-Fork-Offset");
  });

  it("exports every Producer-* name from Section 5.2.1", () => {
    expect(H.PRODUCER_ID).toBe("Producer-Id");
    expect(H.PRODUCER_EPOCH).toBe("Producer-Epoch");
    expect(H.PRODUCER_SEQ).toBe("Producer-Seq");
    expect(H.PRODUCER_EXPECTED_SEQ).toBe("Producer-Expected-Seq");
    expect(H.PRODUCER_RECEIVED_SEQ).toBe("Producer-Received-Seq");
  });

  it("exports lowercase stream-sse-data-encoding per Section 5.8", () => {
    expect(H.SSE_DATA_ENCODING).toBe("stream-sse-data-encoding");
  });

  it("exposes the canonical presence value", () => {
    expect(H.PRESENCE_TRUE).toBe("true");
  });
});
