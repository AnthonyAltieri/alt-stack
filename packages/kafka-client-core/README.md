# `@alt-stack/kafka-client-core`

Transport-neutral types and errors for Kafka producer clients backed by generated Zod topic maps.

This package does not connect to Kafka. Most applications install one implementation instead:

- `@alt-stack/kafka-client-kafkajs`
- `@alt-stack/kafka-client-warpstream`

Both implementations re-export this package's public surface.

## Requirements

- Zod 3.25+ or Zod 4, as declared by the peer range

```bash
pnpm add @alt-stack/kafka-client-core zod
```

## Contract

```typescript
import type { KafkaClient, TopicsMap } from "@alt-stack/kafka-client-core";
import { z } from "zod";

const Topics = {
  "user-events": z.object({ userId: z.string() }),
} satisfies TopicsMap;

declare const client: KafkaClient<typeof Topics>;

await client.send("user-events", { userId: "u_123" });
await client.sendBatch("user-events", [
  { userId: "u_124" },
  { userId: "u_125" },
]);
await client.disconnect();
```

`SendOptions` supports `key`, `partition`, `headers`, and `timestamp`. `KafkaClient<T, TProducer>` also exposes a readonly provider-specific `producer` escape hatch.

## Errors

- `KafkaClientError(message, cause?)` is the base class.
- `ValidationError(topic, message, details?)` represents local Zod failure.
- `SendError(topic, message, cause?)` represents a broker send failure.
- `ConnectionError(message, cause?)` represents initial connection failure.

## Documentation

[Complete client-core API](../../apps/docs/docs/kafka/api/client-core.md)

## License

MIT
