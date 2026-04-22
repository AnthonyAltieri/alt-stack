// Framework-agnostic request/response shapes
export type {
  NormalizedRequest,
  NormalizedResponse,
  SseEvent,
  StreamEndpoint,
  StreamMethod,
} from "./types.js";

// Storage contract + supporting domain types
export type {
  Storage,
  CreateConfig,
  StreamMetadata,
  CreateOutcome,
  DeleteOutcome,
  AppendOpts,
  AppendOutcome,
  ProducerRequest,
  ProducerAppendOutcome,
  ReadChunk,
} from "./storage.js";

// Reference Storage implementation
export { memoryStorage } from "./memory.js";

// Runtime — advanced users only; prefer `stream()` below.
export { handleStreamRequest } from "./runtime.js";
export type { EndpointConfig } from "./runtime.js";

// Builder — the main user-facing entry point
export { stream, StreamBuilder } from "./builder.js";
export type { StreamOptions, StreamMiddleware } from "./builder.js";
