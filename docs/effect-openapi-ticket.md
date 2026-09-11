# OpenAPI to Effect generator

- Scope: one generator package producing native Effect v4 Schema and HttpApi declarations; no custom client runtime.
- Acceptance: a todos OpenAPI fixture generates groups and distinct GET/POST operations; generated-code compilation and native client assertions prove this.
- Acceptance: required params/payload, success types, and declared error types survive generation; positive and negative TypeScript assertions prove this.
- Acceptance: request encoding, success/error decoding, and schema constraints work through native HttpApiClient; one generated fixture exercises the boundary.
- Acceptance: a file-based CLI emits the same compilable contract; a CLI smoke check proves packaging and file I/O.
- Schema authority: OpenAPI is the wire contract; generation preserves schemas, references, HTTP methods, paths, statuses, and operation identifiers.
- Name authority: follow native generator tag/operationId mapping and documented fallback behavior; no handwritten duplicate names.
- Threat model: OpenAPI documents are external data; malformed/unsupported input must fail or report diagnostics rather than silently imply full support. Generated code and application config are trusted.
- Ownership/effects: each generation owns its schema state; CLI owns input/output files; generation precedes output writing. No shared mutable registry, locks, retries, or background work.
- Non-goals: server changes, Zod compatibility, custom codec registry, complete OpenAPI conformance, HTTP client runtime, handwritten declaration DSL.
