---
slug: /
title: Altstack
description: Type-safe boundaries for HTTP APIs, events, background jobs, and generated SDKs.
---

# Altstack

Altstack is a family of small libraries for defining typed boundaries with Zod and carrying those contracts across transports. Use only the pieces your system needs:

- model expected failures with `@alt-stack/result`;
- define an HTTP API once and run it on Hono, Express, Bun, NestJS, or TanStack Start;
- generate Zod, Pydantic, or Rust SDK types from OpenAPI and AsyncAPI documents;
- call generated HTTP contracts through Fetch, Ky, or the Rust/Tokio client runtime;
- define typed Kafka topics or background jobs and connect them through KafkaJS, WarpStream, or Trigger.dev.

Altstack does not require a single application framework. The shared idea is a validated contract at every boundary.

## How the pieces fit

1. A server, Kafka router, or worker router owns Zod input and output schemas.
2. The router validates data before application code receives it.
3. HTTP adapters inspect tagged `Result` errors and serialize declared failures. The current Kafka and worker adapters do not inspect a returned `Err`; throw when the provider must observe failed processing or apply retries.
4. An OpenAPI or AsyncAPI document describes the boundary.
5. A generator turns that document into runtime schemas and language-native types.
6. A generated client supplies language-native types and, where its adapter supports it, runtime validation. TypeScript HTTP clients validate declared path/query/body inputs and declared response statuses, but not headers or undeclared 2xx bodies. Generated Rust HTTP clients use Rust types and Serde without an OpenAPI validation pass.

You can stop after any step. For example, an HTTP service can use the server package without code generation, and a generated Rust client can consume any compatible OpenAPI document without using an Altstack server.

## Choose a starting point

| You want to… | Start here |
| --- | --- |
| model typed success and failure | [Result quickstart](./result/quickstart.md) |
| expose an HTTP API | [Server quickstart](./server/quickstart.md) |
| call an API from TypeScript or Rust | [HTTP client quickstart](./http-client/quickstart.md) |
| publish or consume typed Kafka messages | [Kafka quickstart](./kafka/quickstart.md) |
| run typed background jobs | [Workers quickstart](./workers/quickstart.md) |
| generate SDK types from OpenAPI or AsyncAPI | [Code generation quickstart](./codegen/quickstart.md) |
| format Zod failures for logs | [Utilities quickstart](./utilities/quickstart.md) |
| assemble the complete flow | [Altstack Together quickstart](./together/quickstart.md) |

For package and runtime choices, see [Choose your packages](./start/package-map.md).

## Documentation contract

Every family follows the same path:

- **Quickstart** builds the smallest useful flow.
- **Common Patterns** covers composition, errors, lifecycle, and production concerns.
- **API Documentation** describes the public exports and their options, properties, results, and constraints.

Examples in this site target public package entry points. Quickstarts include the setup needed for their stated flow; Common Patterns and API pages may use focused fragments to isolate one behavior, with the surrounding contract described in prose.

## Requirements

- Repository development uses Node.js 20.19+ or 22.12+ because the locked Docusaurus and lint toolchain is stricter than several published library manifests.
- Server, Kafka, worker, client, and utility packages declare their own Zod peer ranges; check the [package map](./start/package-map.md) before installing.
- Kafka, WarpStream, and Trigger.dev adapters require their corresponding external runtime or service.
- Python code generation requires Python 3.11 or newer.
- Rust packages use the workspace's Rust 2021 edition.

Altstack package versions and adapter peer requirements can change independently. Install the peer versions declared by the package version you select rather than assuming every family has the same range.
