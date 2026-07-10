# Altstack Together common patterns

## Give every contract one owner

The process that validates a boundary should own its source schema:

- an HTTP service owns its router and OpenAPI output;
- a Kafka consumer owns the topic procedure and AsyncAPI output;
- a worker owns the job router and AsyncAPI output;
- clients consume generated artifacts but do not redefine those schemas.

This direction prevents two hand-maintained types from quietly diverging.

## Separate contract generation from process startup

Export routers from modules with no listener or broker side effects. Put `serve()`, `app.listen()`, `Bun.serve()`, `createWorker()`, or consumer startup in a separate entry point. Generation scripts can then import the router without opening a port or connecting to infrastructure.

```text
src/
  contracts/       # routers and Zod schemas; safe to import in tooling
  generated/       # generated client artifacts
  server.ts        # listener lifecycle
  worker.ts        # broker lifecycle
  generate-*.ts    # document generation
```

## Make generation reproducible

A dependable CI sequence is:

1. generate OpenAPI/AsyncAPI from the owning router;
2. run the language generator with pinned package/crate versions;
3. format generated output;
4. type-check or compile the generated SDK;
5. fail when a committed artifact has an unexpected diff.

Do not generate from a live production endpoint when the same document can be created from source. A live endpoint is useful for external consumers, but it makes repository verification depend on deployment state.

## Version the wire contract, not only package names

Treat these as compatibility changes:

- removing or renaming a route, topic, or job;
- making an optional input required;
- narrowing an accepted schema;
- removing a response status or error variant;
- changing the runtime error envelope;
- changing job routing from one topic layout to another.

Adding an optional field or a new endpoint is often additive, but generated language types can still expose naming collisions or stricter validators. Regenerate and compile every supported target before release.

## Translate errors at transport boundaries

`@alt-stack/result` errors are in-process `Error` instances; the transport decides whether a returned `Err` has runtime meaning.

Current HTTP adapters inspect the handler `Result`. A declared tagged error is sent as an `{ error: { code, message, _tag, ... } }` envelope, while generated OpenAPI describes the declared error schema itself. If clients are generated from that OpenAPI, account for this mismatch explicitly rather than assuming the schema and runtime body are identical.

Current Kafka and worker adapters do **not** branch on `Ok` versus `Err`: a returned `err(...)` completes the handler normally unless output validation rejects the whole Result envelope. Throw an `Error` when KafkaJS, WarpStream, or Trigger.dev must observe a failure and apply its retry/error behavior. A TypeScript error union alone does not choose retry, dead-letter, or acknowledgement semantics.

## Validate on both sides

Runtime validation depends on the client family. Generated TypeScript HTTP clients validate declared path/query/body inputs before sending and declared response/error statuses after receiving; they do not validate generated headers or undeclared 2xx bodies. Kafka and worker clients validate the schemas exposed by their adapters. Generated Rust HTTP clients rely on Rust types and Serde rather than an OpenAPI-schema validation pass.

The service remains the security boundary. Keep server, consumer, and worker validation enabled even when every known producer uses a generated client.

Validation callbacks and logs may contain rejected input. Redact credentials, tokens, personal data, and large payloads before they leave the process.

## Redact uncaught server failures

The current Hono, Express, Bun, and TanStack Start fallbacks include an uncaught `Error` message and stack in the 500 response. Treat the defaults as development diagnostics. For production, create a redacting `default500Error` with `init(...)` and pass the returned `defaultErrorHandlers` into the adapter. The [server error pattern](../server/common-patterns.md#error-wire-formats-and-openapi) shows the exact callback and response shape.

## Design idempotency end to end

HTTP request retries and job retries can repeat side effects. Use stable operation identifiers at the application layer:

- accept an idempotency key at the HTTP boundary;
- propagate it into a job's `TriggerOptions.idempotencyKey` or message key;
- store completion state with the domain mutation;
- make the worker safe to replay before acknowledging the broker record.

Generated types can require the identifier, but they cannot make the downstream operation idempotent.

## Align telemetry across boundaries

Use one service name per deployable process and propagate correlation information deliberately. Server and worker telemetry options create spans around their own handlers; Kafka headers, job metadata, and HTTP headers are the bridge between processes.

Avoid recording full parsed input by default. High-signal fields include route/job name, status or error tag, retry attempt, queue time, and stable request/job identifiers.

## Own connection lifecycle

Clients and workers that connect to Kafka-compatible brokers hold resources:

- create them once during process startup or lazily behind a single shared promise;
- do not connect for every request;
- call `disconnect()` during graceful shutdown;
- distinguish a startup connection failure from a per-message send failure.

Hono and Express adapters return applications/routers that the host owns. Bun's `createServer()` starts a listener immediately. Trigger.dev owns task execution lifecycle. Keep these adapter differences visible in deployment code.

## Test at three levels

1. **Contract tests:** generate the document and compile/type-check generated SDKs.
2. **Adapter tests:** make a real in-memory or local HTTP request and assert status/body validation.
3. **Infrastructure tests:** use an actual compatible broker or Trigger.dev environment for delivery, retry, and shutdown behavior.

Passing a generator unit test does not prove broker connectivity; passing an end-to-end request does not prove every public export is documented. Keep the checks separate and name what each one proves.

## See also

[Altstack Together API Documentation](./documentation.md) is the integration reference for artifacts, shapes, and lifecycle boundaries.
