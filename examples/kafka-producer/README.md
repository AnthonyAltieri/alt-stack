# Kafka producer example

A router-derived `@alt-stack/kafka-core` producer that sends typed JSON records to the topics consumed by `examples/kafka-consumer`. It also demonstrates AsyncAPI generation and `@alt-stack/zod-asyncapi` code generation.

## Prerequisites

- Node.js 18+
- pnpm 10
- a Kafka-compatible broker at `localhost:9092` by default
- provisioned `user-events`, `orders/created`, and `notifications` topics

From the repository root:

```bash
pnpm install
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `KAFKA_BROKERS` | `localhost:9092` | comma-separated brokers |
| `KAFKA_CLIENT_ID` | `example-producer` | KafkaJS client ID |
| `SKIP_ENV_VALIDATION` | unset | any truthy value skips environment validation |

## Send the sample records

Start the consumer in one terminal:

```bash
pnpm --filter kafka-consumer dev
```

Run the producer in another:

```bash
pnpm --filter kafka-producer dev
```

The producer sends one user event, one order event, one notification, then a batch of three user events. Payloads are validated from `producerRouter` before JSON encoding, and the producer disconnects after the sends.

## Generate the contract

```bash
pnpm --filter kafka-producer generate-spec
pnpm --filter kafka-producer generate-sdk
```

- `generate-spec` rewrites `asyncapi.json` from the router.
- `generate-sdk` rewrites `generated-types.ts` from that spec.

The generated file is a caller-side contract example; the running producer intentionally derives types directly from the live router.

## Source map

- `src/router.ts` owns topic names and Zod schemas.
- `src/index.ts` creates the router-derived producer and sends records.
- `src/generate-spec.ts` creates AsyncAPI 3.0.
- `src/env.ts` validates broker settings.

## Verify

```bash
pnpm --filter kafka-producer check-types
```

See [Kafka common patterns](../../apps/docs/docs/kafka/common-patterns.md) for choosing between a live-router producer and generated-schema clients.
