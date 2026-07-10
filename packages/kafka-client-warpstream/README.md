# `@alt-stack/kafka-client-warpstream`

A generated-schema Kafka event producer with WarpStream-oriented KafkaJS defaults.

This is not a background-job client. Use `@alt-stack/workers-client-warpstream` or `@alt-stack/workers-warpstream#createJobClient` for Worker jobs.

## Requirements

- KafkaJS 2.x
- Zod 3.25+ or Zod 4
- a reachable endpoint and pre-provisioned topics

```bash
pnpm add @alt-stack/kafka-client-warpstream kafkajs zod
```

## Usage

```typescript
import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";
import { Topics } from "./generated-events.js";

const client = await createWarpStreamClient({
  bootstrapServer: "localhost:9092",
  clientId: "accounts-publisher",
  topics: Topics,
});

await client.send("user-events", {
  userId: "u_123",
  kind: "created",
});

await client.disconnect();
```

The adapter uses a 10-second connection timeout, 60-second metadata age, `allowAutoTopicCreation: false`, and LZ4 sends. `producerConfig` overrides producer defaults. It exposes only one bootstrap server and does not currently expose KafkaJS TLS/SASL or a prebuilt Kafka instance; use the KafkaJS binding when those settings are needed.

Validation, send, and connection failures use the structured errors from `@alt-stack/kafka-client-core`. The client exposes its KafkaJS producer through `client.producer`.

## Documentation

- [Kafka client contract](../../apps/docs/docs/kafka/api/client-core.md)
- [WarpStream binding API](../../apps/docs/docs/kafka/api/warpstream.md)

## License

MIT
