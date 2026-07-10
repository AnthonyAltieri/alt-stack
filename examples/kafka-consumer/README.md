# Kafka consumer example

A runnable `@alt-stack/kafka-core` consumer showing Zod message schemas, custom context, ordinary middleware, topic metadata, multiple topics, and Result-returning handlers.

## Prerequisites

- Node.js 18+
- pnpm 10
- a Kafka-compatible broker reachable at `localhost:9092` by default
- provisioned `user-events`, `orders/created`, and `notifications` topics

Install the workspace once from the repository root:

```bash
pnpm install
```

## Configuration

The example reads process environment variables directly; no `.env` file is required.

| Variable | Default | Meaning |
| --- | --- | --- |
| `KAFKA_BROKERS` | `localhost:9092` | comma-separated brokers |
| `KAFKA_CLIENT_ID` | `example-consumer` | KafkaJS client ID |
| `KAFKA_GROUP_ID` | `example-group` | consumer group |
| `SKIP_ENV_VALIDATION` | unset | any truthy value skips `@t3-oss/env-core` validation |

## Run

```bash
pnpm --filter kafka-consumer dev
```

The process connects, subscribes from the group's latest position (`fromBeginning: false`), and remains active inside KafkaJS `consumer.run`. `SIGINT` and `SIGTERM` disconnect cleanly.

## Send compatible records

Use the companion producer example:

```bash
pnpm --filter kafka-producer dev
```

Or publish JSON with any Kafka client. Representative payloads are:

```json
{"userId":"u_123","eventType":"created","timestamp":1720000000000}
```

```json
{"orderId":"o_123","userId":"u_123","items":[{"productId":"p_1","quantity":2,"price":29.99}],"total":59.98}
```

## Source map

- `src/env.ts` validates broker/client/group configuration.
- `src/index.ts` defines schemas, reusable procedures, middleware, router, context, consumer, and shutdown.

The custom logger prefixes output with topic, partition, and offset. The example's middleware logs before/after each handler.

## Current output-schema limitation

The `orders/created` procedure declares an output schema and returns `ok(value)`. The current consumer validates the entire Result envelope rather than the inner successful value, so this handler demonstrates a known runtime mismatch and will throw output validation after processing a valid record. Remove `.output(OrderProcessedSchema)` to run that topic under the current adapter, or change the schema to describe the actual Result envelope.

Returned `err(...)` values are likewise not converted into Kafka failures by the current consumer. Throw when KafkaJS must observe failed processing.

## Verify

```bash
pnpm --filter kafka-consumer check-types
```

See the [Kafka quickstart](../../apps/docs/docs/kafka/quickstart.md) for a minimal production-oriented path.

