# Choose your packages

Altstack packages are deliberately separable. Start with the boundary you own, then add an adapter or generator only when it solves a concrete integration problem.

## Package map

| Family | Package | Use it for |
| --- | --- | --- |
| Result | `@alt-stack/result` | tagged success/failure values and composable error handling |
| CLI | `@alt-stack/cli` | typed nested commands, Zod-validated tokens, context middleware, and explicit execution outcomes |
| Servers | `@alt-stack/server-core` | framework-neutral routers, procedures, middleware, OpenAPI, and telemetry |
| Servers | `@alt-stack/server-hono` | a Hono application and Hono request context |
| Servers | `@alt-stack/server-express` | an Express router and Express request/response context |
| Servers | `@alt-stack/server-bun` | a Bun-native `fetch` server |
| Servers | `@alt-stack/server-nestjs` | Nest module registration or middleware integration |
| Servers | `@alt-stack/server-tanstack-start` | TanStack Start request handlers |
| HTTP clients | `@alt-stack/http-client-core` | transport-neutral typed client contracts and errors |
| HTTP clients | `@alt-stack/http-client-fetch` | browser, Node, Bun, or other standard Fetch runtimes |
| HTTP clients | `@alt-stack/http-client-ky` | a Ky-backed TypeScript client |
| HTTP clients | `http-client-rust-tokio` | generated Rust SDK execution through Reqwest/Tokio |
| Kafka | `@alt-stack/kafka-core` | typed topic procedures, consumers, producers, AsyncAPI, and middleware |
| Kafka clients | `@alt-stack/kafka-client-core` | transport-neutral generated-topic client types |
| Kafka clients | `@alt-stack/kafka-client-kafkajs` | KafkaJS producer client |
| Kafka clients | `@alt-stack/kafka-client-warpstream` | WarpStream-configured KafkaJS producer client |
| Workers | `@alt-stack/workers-core` | typed job procedures, routers, middleware, AsyncAPI, and telemetry |
| Workers | `@alt-stack/workers-trigger` | run worker procedures as Trigger.dev tasks |
| Workers | `@alt-stack/workers-warpstream` | run and enqueue worker procedures through WarpStream/Kafka |
| Worker clients | `@alt-stack/workers-client-core` | transport-neutral generated-job client types |
| Worker clients | `@alt-stack/workers-client-trigger` | enqueue jobs with Trigger.dev |
| Worker clients | `@alt-stack/workers-client-warpstream` | enqueue jobs through WarpStream/Kafka |
| OpenAPI generation | `@alt-stack/zod-openapi` | generate TypeScript Zod schemas and request/response maps |
| OpenAPI generation | `python-pydantic-openapi` | generate Python Pydantic models |
| OpenAPI generation | `rust-openapi` | generate Rust models and route modules |
| OpenAPI generation | `rust-openapi-crate-gen` | scaffold a consumable Rust SDK crate |
| AsyncAPI generation | `@alt-stack/zod-asyncapi` | generate TypeScript Zod schemas and topic maps |
| Utilities | `@alt-stack/zod-error` | turn a Zod error into readable text or structured log data |

The published `@alt-stack/example-altstack-server-sdk` and `@alt-stack/example-kafka-producer-sdk` packages are generated examples. Their identifiers demonstrate generator output; they are not framework-wide contracts. `@alt-stack/openapi-test-spec` and `@alt-stack/typescript-config` are private workspace fixtures, not packages for application installation.

## Runtime and peer-dependency matrix

| Packages | Required peers or runtime |
| --- | --- |
| `@alt-stack/cli`, `server-*`, all worker runtimes, `kafka-core`, TypeScript HTTP clients, generated TypeScript SDKs, utilities | Zod 4 (`@alt-stack/cli` also depends on `@alt-stack/result`; worker adapters depend on `workers-core`) |
| `@alt-stack/result` | no runtime dependency; Zod 4 is an optional peer in the package manifest |
| `kafka-client-*`, `workers-client-*` | Zod 3.25 or Zod 4, as declared by the selected package |
| `server-core`, `workers-core` | optional `@opentelemetry/api` 1.x peer when telemetry is enabled |
| Hono adapter | Hono 4.x |
| Express adapter | Express 4.x or 5.x |
| NestJS adapter | NestJS common/core/platform-express 9–11 and Express 4–5 |
| TanStack Start adapter | `@tanstack/react-router` at the peer range in its manifest |
| Kafka core and KafkaJS/WarpStream adapters | KafkaJS 2.x and a reachable Kafka-compatible broker |
| Trigger adapters | `@trigger.dev/sdk` 3.x and a Trigger.dev project |
| Python generator | Python 3.11+ and Pydantic 2.7+ |
| Rust libraries | Rust 2021 toolchain; Tokio for async clients/CLIs |

Package manifests are the authority for exact peer ranges. This table explains the boundaries; it is not a replacement for your package manager's peer-dependency output.

## Common combinations

### TypeScript command-line application

Install `@alt-stack/cli` with Zod 4. Define the hierarchy with `initCli().router`, create the application with `createCli`, and connect it to the host process with `runCli`. Add no parser or terminal dependency unless the application needs behavior beyond the package's explicit v1 grammar.

### TypeScript HTTP service

Install one server adapter, Zod, and the adapter's framework peer. Add `@alt-stack/zod-openapi` only if you generate a client contract.

### TypeScript frontend

Generate `Request` and `Response` maps with `@alt-stack/zod-openapi`, then use either `@alt-stack/http-client-fetch` or `@alt-stack/http-client-ky`.

### Event-driven service

Use `@alt-stack/kafka-core` when topic handlers and producers are part of the service. Use a `kafka-client-*` package when another application only needs to send data against a generated topic map.

### Background jobs

Define the job contract with `@alt-stack/workers-core` through either runtime adapter. Applications that only enqueue jobs use the matching `workers-client-*` package and generated job schemas.

### Multi-language SDKs

Expose OpenAPI from any compatible server, then select the TypeScript/Zod, Python/Pydantic, or Rust generator. The server does not need to be implemented with Altstack for the generators to work.

## Next step

Pick one family quickstart from the [documentation home](../intro.md). After its local flow works, use [Altstack Together](../together/quickstart.md) to add contract generation and a second boundary.
