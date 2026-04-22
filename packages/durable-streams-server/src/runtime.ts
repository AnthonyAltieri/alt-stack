import {
  STREAM_NEXT_OFFSET,
  STREAM_CLOSED,
  STREAM_UP_TO_DATE,
  STREAM_CURSOR,
  STREAM_TTL,
  STREAM_EXPIRES_AT,
  STREAM_FORKED_FROM,
  STREAM_FORK_OFFSET,
  PRESENCE_TRUE,
  PRODUCER_EPOCH,
  PRODUCER_SEQ,
  PRODUCER_EXPECTED_SEQ,
  PRODUCER_RECEIVED_SEQ,
  SSE_DATA_ENCODING,
  OFFSET_BEGINNING,
  isSentinel,
  parseOffsetQuery,
  parseCursor,
  parseStreamTtl,
  parseStreamExpiresAt,
  parseStreamClosed,
  parseProducerHeaders,
  parseAndFlattenJsonAppend,
  frameJsonRead,
  advanceCursor,
  computeCursor,
  etagFor,
  formatEtagHeader,
  matchesIfNoneMatch,
  statusFor,
  InvalidHeader,
  EmptyAppendBody,
  ConflictingTtlAndExpiry,
  ContentTypeMismatch,
  MethodNotAllowed,
  StreamClosed as StreamClosedErr,
  StaleProducerEpoch,
  ProducerSeqGap,
  EmptyJsonArray,
  InvalidJson,
  type DurableStreamError,
  type HeaderParseError,
  type CursorParseError,
} from "@alt-stack/durable-streams-core";

import type {
  NormalizedRequest,
  NormalizedResponse,
  SseEvent,
} from "./types.js";
import type {
  Storage,
  CreateConfig,
  StreamMetadata,
  ReadChunk,
} from "./storage.js";

/** Configuration for a single stream endpoint. Supplied by the builder. */
export interface EndpointConfig {
  readonly storage: Storage;
  /** Allow-list of content types. If set, rejected content types produce 409 on PUT/POST. */
  readonly contentType?: string | readonly string[];
  /** TTL clamping applied to client-supplied Stream-TTL values. */
  readonly ttl?: { readonly default?: number; readonly max?: number };
  /** Upper bound on request body size. */
  readonly maxBodyBytes?: number;
  /** Long-poll timeout in milliseconds. Defaults to 30s. */
  readonly longPollTimeoutMs?: number;
  /** Catch-up read chunk size cap. Defaults to 1 MiB. */
  readonly maxReadBytes?: number;
}

const DEFAULT_LONG_POLL_MS = 30_000;
const DEFAULT_MAX_READ_BYTES = 1 << 20;
const JSON_CONTENT_TYPE = "application/json";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function handleStreamRequest(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  switch (req.method) {
    case "PUT":
      return handlePut(cfg, req);
    case "HEAD":
      return handleHead(cfg, req);
    case "DELETE":
      return handleDelete(cfg, req);
    case "POST":
      return handlePost(cfg, req);
    case "GET":
      return handleGet(cfg, req);
    default:
      return errorResponse(new MethodNotAllowed(req.method));
  }
}

// ---------------------------------------------------------------------------
// PUT (create / fork-create / create-and-close)
// ---------------------------------------------------------------------------

async function handlePut(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  const contentType = req.headers["content-type"] ?? "application/octet-stream";
  if (!contentTypeAllowed(cfg, contentType)) {
    return errorResponse(new ContentTypeMismatch(String(cfg.contentType)));
  }

  const ttlRaw = req.headers[STREAM_TTL.toLowerCase()];
  const expRaw = req.headers[STREAM_EXPIRES_AT.toLowerCase()];
  if (ttlRaw !== undefined && expRaw !== undefined) {
    return errorResponse(new ConflictingTtlAndExpiry());
  }
  const ttlResult = parseStreamTtl(ttlRaw);
  if (ttlResult._tag === "Err") return errorResponse(toInvalidHeader(ttlResult.error));
  const expResult = parseStreamExpiresAt(expRaw);
  if (expResult._tag === "Err") return errorResponse(toInvalidHeader(expResult.error));

  const ttlSeconds = clampTtl(cfg, ttlResult.value);
  const wantsClosed = parseStreamClosed(req.headers[STREAM_CLOSED.toLowerCase()]);
  const forkedFrom = req.headers[STREAM_FORKED_FROM.toLowerCase()];
  const forkOffset = req.headers[STREAM_FORK_OFFSET.toLowerCase()];

  const createCfg: CreateConfig = buildCreateConfig({
    contentType,
    ttlSeconds,
    expiresAt: expResult.value ?? undefined,
    closed: wantsClosed,
    forkedFrom,
    forkOffset,
  });

  const initialMessages =
    req.body && req.body.length > 0 ? await bodyToMessages(req.body, contentType) : undefined;
  if (initialMessages && initialMessages._tag === "Err") {
    return errorResponse(initialMessages.error);
  }

  const r = await cfg.storage.create(
    req.streamUrl,
    createCfg,
    initialMessages ? initialMessages.value : undefined,
  );
  if (r._tag === "Err") return errorResponse(r.error);

  const headers: Record<string, string> = {
    "Content-Type": r.value.metadata.contentType,
    [STREAM_NEXT_OFFSET]: r.value.metadata.tailOffset || OFFSET_BEGINNING,
  };
  if (r.value.metadata.closed) headers[STREAM_CLOSED] = PRESENCE_TRUE;
  if (r.value.created) headers["Location"] = req.streamUrl;

  return noBody(r.value.created ? 201 : 200, headers);
}

// ---------------------------------------------------------------------------
// HEAD
// ---------------------------------------------------------------------------

async function handleHead(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  const r = await cfg.storage.head(req.streamUrl);
  if (r._tag === "Err") return errorResponse(r.error);
  return noBody(200, metadataHeaders(r.value, { cacheable: false }));
}

// ---------------------------------------------------------------------------
// DELETE
// ---------------------------------------------------------------------------

async function handleDelete(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  const r = await cfg.storage.delete(req.streamUrl);
  if (r._tag === "Err") return errorResponse(r.error);
  return noBody(204, {});
}

// ---------------------------------------------------------------------------
// POST (append; with/without producer; with/without close)
// ---------------------------------------------------------------------------

async function handlePost(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  const wantsClose = parseStreamClosed(req.headers[STREAM_CLOSED.toLowerCase()]);
  const body = req.body;
  const bodyIsEmpty = body === null || body.length === 0;

  // Close-only: empty body + Stream-Closed: true. Content-Type is ignored.
  if (bodyIsEmpty && wantsClose) {
    const head = await cfg.storage.head(req.streamUrl);
    if (head._tag === "Err") return errorResponse(head.error);
    if (head.value.closed) {
      const headers: Record<string, string> = {
        [STREAM_NEXT_OFFSET]: head.value.tailOffset || OFFSET_BEGINNING,
        [STREAM_CLOSED]: PRESENCE_TRUE,
      };
      return noBody(204, headers);
    }
    const r = await cfg.storage.append(req.streamUrl, [], {
      contentType: head.value.contentType,
      close: true,
    });
    if (r._tag === "Err") return errorResponse(r.error);
    return noBody(204, {
      [STREAM_NEXT_OFFSET]: r.value.nextOffset || OFFSET_BEGINNING,
      [STREAM_CLOSED]: PRESENCE_TRUE,
    });
  }

  // Empty body without Stream-Closed: true is always an error.
  if (bodyIsEmpty) {
    return errorResponse(new EmptyAppendBody());
  }

  const contentType = req.headers["content-type"];
  if (contentType === undefined || contentType === "") {
    return errorResponse(
      new InvalidHeader("Content-Type", "required when POST body is non-empty"),
    );
  }

  const messagesResult = await bodyToMessages(body!, contentType);
  if (messagesResult._tag === "Err") return errorResponse(messagesResult.error);
  const messages = messagesResult.value;

  const producerResult = parseProducerHeaders({
    id: req.headers["producer-id"],
    epoch: req.headers[PRODUCER_EPOCH.toLowerCase()],
    seq: req.headers[PRODUCER_SEQ.toLowerCase()],
  });
  if (producerResult._tag === "Err") return errorResponse(toInvalidHeader(producerResult.error));
  const producer = producerResult.value;

  if (producer === null) {
    const r = await cfg.storage.append(req.streamUrl, messages, {
      contentType,
      close: wantsClose,
    });
    if (r._tag === "Err") return errorResponse(r.error);
    const headers: Record<string, string> = {
      [STREAM_NEXT_OFFSET]: r.value.nextOffset || OFFSET_BEGINNING,
    };
    if (r.value.closed) headers[STREAM_CLOSED] = PRESENCE_TRUE;
    return noBody(204, headers);
  }

  const r = await cfg.storage.appendWithProducer(
    req.streamUrl,
    messages,
    producer,
    { contentType, close: wantsClose },
  );
  if (r._tag === "Err") return errorResponse(r.error);

  const outcome = r.value;
  const headers: Record<string, string> = {
    [STREAM_NEXT_OFFSET]: outcome.nextOffset || OFFSET_BEGINNING,
  };
  if (outcome.closed) headers[STREAM_CLOSED] = PRESENCE_TRUE;

  if (outcome.outcome === "duplicate") {
    headers[PRODUCER_EPOCH] = String(outcome.currentState.epoch);
    headers[PRODUCER_SEQ] = String(outcome.currentState.lastSeq);
    return noBody(204, headers);
  }
  headers[PRODUCER_EPOCH] = String(outcome.newState.epoch);
  headers[PRODUCER_SEQ] = String(outcome.newState.lastSeq);
  // On first write of a new epoch the spec wants 200 OK; otherwise 204 No Content
  // for produce-side deduplication-aware writes. Plain 204 works for both in
  // practice — the distinction is non-material once headers carry the state.
  return noBody(200, headers);
}

// ---------------------------------------------------------------------------
// GET (catch-up / long-poll / SSE)
// ---------------------------------------------------------------------------

async function handleGet(
  cfg: EndpointConfig,
  req: NormalizedRequest,
): Promise<NormalizedResponse> {
  const offsetRaw = req.query["offset"];
  const offsetResult = parseOffsetQuery(offsetRaw);
  if (offsetResult._tag === "Err") return errorResponse(toInvalidHeader(offsetResult.error));
  const offsetTok = offsetResult.value;

  const live = req.query["live"];
  if (live !== undefined && live !== "long-poll" && live !== "sse") {
    return errorResponse(new InvalidHeader("live", `unknown value: ${live}`));
  }

  // Resolve sentinels to concrete offsets via storage.head().
  const head = await cfg.storage.head(req.streamUrl);
  if (head._tag === "Err") return errorResponse(head.error);
  const meta = head.value;

  const sentinel = isSentinel(offsetTok);
  const fromOffset =
    sentinel === "start"
      ? ""
      : sentinel === "now"
        ? meta.tailOffset
        : offsetTok;

  if (live === "sse") return handleSse(cfg, req, fromOffset, meta);
  if (live === "long-poll") return handleLongPoll(cfg, req, fromOffset, meta, sentinel === "now");
  return handleCatchup(cfg, req, fromOffset, meta, sentinel === "now");
}

async function handleCatchup(
  cfg: EndpointConfig,
  req: NormalizedRequest,
  fromOffset: string,
  meta: StreamMetadata,
  isNowSentinel: boolean,
): Promise<NormalizedResponse> {
  // offset=now: empty body, always up-to-date, no ETag per Section 8.
  if (isNowSentinel) {
    return renderReadChunk(
      req,
      meta,
      {
        streamId: meta.streamId,
        startOffset: "",
        nextOffset: fromOffset,
        messages: [],
        upToDate: true,
        closed: meta.closed,
      },
      { isNowSentinel: true, requestedOffset: fromOffset },
    );
  }

  const r = await cfg.storage.read(
    req.streamUrl,
    fromOffset,
    cfg.maxReadBytes ?? DEFAULT_MAX_READ_BYTES,
  );
  if (r._tag === "Err") return errorResponse(r.error);
  return renderReadChunk(req, meta, r.value, {
    isNowSentinel: false,
    requestedOffset: fromOffset,
  });
}

async function handleLongPoll(
  cfg: EndpointConfig,
  req: NormalizedRequest,
  fromOffset: string,
  meta: StreamMetadata,
  isNowSentinel: boolean,
): Promise<NormalizedResponse> {
  // Closed-at-tail: return immediately with 204 + Stream-Closed.
  if (meta.closed && fromOffset === meta.tailOffset) {
    return noBody(204, {
      [STREAM_NEXT_OFFSET]: meta.tailOffset || OFFSET_BEGINNING,
      [STREAM_UP_TO_DATE]: PRESENCE_TRUE,
      [STREAM_CLOSED]: PRESENCE_TRUE,
    });
  }

  const cursorResult = parseCursor(req.query["cursor"]);
  if (cursorResult._tag === "Err") return errorResponse(toInvalidCursor(cursorResult.error));

  const timeoutMs = cfg.longPollTimeoutMs ?? DEFAULT_LONG_POLL_MS;
  const r = await cfg.storage.waitForAppend(
    req.streamUrl,
    fromOffset,
    timeoutMs,
    req.signal,
  );
  if (r._tag === "Err") return errorResponse(r.error);
  const chunk = r.value;

  if (chunk.messages.length === 0) {
    // Timeout: 204 + Stream-Up-To-Date + (possibly) Stream-Closed.
    const headers: Record<string, string> = {
      [STREAM_NEXT_OFFSET]: chunk.nextOffset || OFFSET_BEGINNING,
      [STREAM_UP_TO_DATE]: PRESENCE_TRUE,
    };
    if (chunk.closed) {
      headers[STREAM_CLOSED] = PRESENCE_TRUE;
    } else {
      headers[STREAM_CURSOR] = String(
        advanceCursor(cursorResult.value, Date.now(), Math.random),
      );
    }
    return noBody(204, headers);
  }

  return renderReadChunk(req, meta, chunk, {
    isNowSentinel,
    requestedOffset: fromOffset,
    includeCursor: !chunk.closed,
    clientCursor: cursorResult.value,
  });
}

async function handleSse(
  cfg: EndpointConfig,
  req: NormalizedRequest,
  fromOffset: string,
  meta: StreamMetadata,
): Promise<NormalizedResponse> {
  const encoding =
    meta.contentType.startsWith("text/") || meta.contentType === JSON_CONTENT_TYPE
      ? "utf8"
      : "base64";

  const headers: Record<string, string> = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
  if (encoding === "base64") headers[SSE_DATA_ENCODING] = "base64";

  const iterable = sseStream(cfg, req, fromOffset, meta, encoding);
  return {
    status: 200,
    headers,
    bodyKind: "sse",
    body: iterable,
  };
}

async function* sseStream(
  cfg: EndpointConfig,
  req: NormalizedRequest,
  fromOffset: string,
  meta: StreamMetadata,
  encoding: "utf8" | "base64",
): AsyncIterable<SseEvent> {
  // If the stream is closed and the client is at or past the tail, emit a
  // single control event with streamClosed: true and stop.
  if (meta.closed && fromOffset === meta.tailOffset) {
    yield {
      event: "control",
      data: JSON.stringify({
        streamNextOffset: meta.tailOffset || OFFSET_BEGINNING,
        streamClosed: true,
        upToDate: true,
      }),
    };
    return;
  }

  const isJson = meta.contentType === JSON_CONTENT_TYPE;

  for await (const result of cfg.storage.subscribe(
    req.streamUrl,
    fromOffset,
    req.signal,
  )) {
    if (result._tag === "Err") {
      // Stream vanished mid-flight; terminate cleanly.
      return;
    }
    const chunk = result.value;
    if (chunk.messages.length > 0) {
      yield {
        event: "data",
        data: formatSseData(chunk.messages, isJson, encoding),
      };
    }
    const control: Record<string, unknown> = {
      streamNextOffset: chunk.nextOffset || OFFSET_BEGINNING,
    };
    if (chunk.closed) {
      control["streamClosed"] = true;
    } else {
      control["streamCursor"] = String(
        advanceCursor(null, Date.now(), Math.random),
      );
      if (chunk.upToDate) control["upToDate"] = true;
    }
    yield { event: "control", data: JSON.stringify(control) };
    if (chunk.closed) return;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function noBody(
  status: number,
  headers: Record<string, string>,
): NormalizedResponse {
  return { status, headers, bodyKind: "none" };
}

function text(
  status: number,
  headers: Record<string, string>,
  body: string,
): NormalizedResponse {
  return { status, headers, bodyKind: "text", body };
}

function bytes(
  status: number,
  headers: Record<string, string>,
  body: Uint8Array,
): NormalizedResponse {
  return { status, headers, bodyKind: "bytes", body };
}

function errorResponse(err: DurableStreamError): NormalizedResponse {
  const headers: Record<string, string> = {};
  switch (err._tag) {
    case "StreamClosed": {
      headers[STREAM_CLOSED] = PRESENCE_TRUE;
      headers[STREAM_NEXT_OFFSET] = (err as StreamClosedErr).finalOffset || OFFSET_BEGINNING;
      break;
    }
    case "StaleProducerEpoch":
      headers[PRODUCER_EPOCH] = String((err as StaleProducerEpoch).currentEpoch);
      break;
    case "ProducerSeqGap": {
      const e = err as ProducerSeqGap;
      headers[PRODUCER_EXPECTED_SEQ] = String(e.expectedSeq);
      headers[PRODUCER_RECEIVED_SEQ] = String(e.receivedSeq);
      break;
    }
  }
  return noBody(statusFor(err), headers);
}

function metadataHeaders(
  meta: StreamMetadata,
  opts: { cacheable: boolean },
): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": meta.contentType,
    [STREAM_NEXT_OFFSET]: meta.tailOffset || OFFSET_BEGINNING,
  };
  if (meta.closed) h[STREAM_CLOSED] = PRESENCE_TRUE;
  if (meta.ttlSeconds !== undefined) h[STREAM_TTL] = String(meta.ttlSeconds);
  if (meta.expiresAt !== undefined) h[STREAM_EXPIRES_AT] = meta.expiresAt.toISOString();
  if (!opts.cacheable) h["Cache-Control"] = "no-store";
  return h;
}

function toInvalidHeader(e: HeaderParseError): DurableStreamError {
  return new InvalidHeader(e.header, e.reason);
}

function toInvalidCursor(e: CursorParseError): DurableStreamError {
  return new InvalidHeader("cursor", `invalid value: ${e.raw}`);
}

function contentTypeAllowed(cfg: EndpointConfig, ct: string): boolean {
  if (cfg.contentType === undefined) return true;
  if (typeof cfg.contentType === "string") return cfg.contentType === ct;
  return cfg.contentType.includes(ct);
}

function clampTtl(cfg: EndpointConfig, requested: number | null): number | undefined {
  if (requested === null) return cfg.ttl?.default;
  if (cfg.ttl?.max !== undefined && requested > cfg.ttl.max) return cfg.ttl.max;
  return requested;
}

function buildCreateConfig(params: {
  contentType: string;
  ttlSeconds?: number;
  expiresAt?: Date;
  closed?: boolean;
  forkedFrom?: string;
  forkOffset?: string;
}): CreateConfig {
  const cfg: {
    contentType: string;
    ttlSeconds?: number;
    expiresAt?: Date;
    closed?: boolean;
    forkedFrom?: string;
    forkOffset?: string;
  } = { contentType: params.contentType };
  if (params.ttlSeconds !== undefined) cfg.ttlSeconds = params.ttlSeconds;
  if (params.expiresAt !== undefined) cfg.expiresAt = params.expiresAt;
  if (params.closed) cfg.closed = true;
  if (params.forkedFrom !== undefined) cfg.forkedFrom = params.forkedFrom;
  if (params.forkOffset !== undefined) cfg.forkOffset = params.forkOffset;
  return cfg;
}

async function bodyToMessages(
  body: Uint8Array,
  contentType: string,
): Promise<
  | { _tag: "Ok"; value: Uint8Array[] }
  | { _tag: "Err"; error: DurableStreamError }
> {
  if (contentType !== JSON_CONTENT_TYPE) {
    return { _tag: "Ok", value: [body] };
  }
  const raw = new TextDecoder().decode(body);
  const framed = parseAndFlattenJsonAppend(raw);
  if (framed._tag === "Err") {
    const e: DurableStreamError =
      framed.error.reason === "empty-array"
        ? new EmptyJsonArray()
        : new InvalidJson(framed.error.message);
    return { _tag: "Err", error: e };
  }
  const encoder = new TextEncoder();
  return {
    _tag: "Ok",
    value: framed.value.map((m) => encoder.encode(JSON.stringify(m))),
  };
}

function renderReadChunk(
  req: NormalizedRequest,
  meta: StreamMetadata,
  chunk: ReadChunk,
  opts: {
    isNowSentinel: boolean;
    requestedOffset: string;
    includeCursor?: boolean;
    clientCursor?: number | null;
  },
): NormalizedResponse {
  const isJson = meta.contentType === JSON_CONTENT_TYPE;
  const headers: Record<string, string> = {
    "Content-Type": meta.contentType,
    [STREAM_NEXT_OFFSET]: chunk.nextOffset || OFFSET_BEGINNING,
  };
  if (chunk.upToDate) headers[STREAM_UP_TO_DATE] = PRESENCE_TRUE;
  if (chunk.closed) headers[STREAM_CLOSED] = PRESENCE_TRUE;

  if (opts.includeCursor && !chunk.closed) {
    headers[STREAM_CURSOR] = String(
      advanceCursor(opts.clientCursor ?? null, Date.now(), Math.random),
    );
  }

  // ETag omitted for offset=now (Section 8).
  if (!opts.isNowSentinel) {
    const etag = etagFor({
      streamId: chunk.streamId,
      startOffset: opts.requestedOffset,
      endOffset: chunk.nextOffset,
      closed: chunk.closed,
    });
    if (matchesIfNoneMatch(etag, req.headers["if-none-match"])) {
      return noBody(304, { ETag: formatEtagHeader(etag) });
    }
    headers["ETag"] = formatEtagHeader(etag);
  }

  if (chunk.messages.length === 0) {
    if (isJson) return text(200, headers, frameJsonRead([]));
    return noBody(200, headers);
  }

  if (isJson) {
    // messages are individually-encoded JSON values; join into one array body.
    const decoder = new TextDecoder();
    const values = chunk.messages.map((m) => decoder.decode(m));
    return text(200, headers, "[" + values.join(",") + "]");
  }

  // Non-JSON: concatenate bytes (typical for single-message POSTs).
  const total = chunk.messages.reduce((n, m) => n + m.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const m of chunk.messages) {
    out.set(m, o);
    o += m.length;
  }
  return bytes(200, headers, out);
}

function formatSseData(
  messages: readonly Uint8Array[],
  isJson: boolean,
  encoding: "utf8" | "base64",
): string {
  if (encoding === "base64") {
    const total = messages.reduce((n, m) => n + m.length, 0);
    const concat = new Uint8Array(total);
    let o = 0;
    for (const m of messages) {
      concat.set(m, o);
      o += m.length;
    }
    // Node has Buffer; in browsers tsup polyfills. This file targets Node.
    return Buffer.from(concat).toString("base64");
  }
  if (isJson) {
    const decoder = new TextDecoder();
    const values = messages.map((m) => decoder.decode(m));
    return "[" + values.join(",") + "]";
  }
  return messages.map((m) => new TextDecoder().decode(m)).join("");
}

// Preserve the `computeCursor` import usage (referenced indirectly for typings)
void computeCursor;
