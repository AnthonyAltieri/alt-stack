# `@alt-stack/kafka-client-kafkajs`

A KafkaJS producer client typed and runtime-validated by a generated Zod topic map. It publishes events; it does not create consumers or use a Kafka router.

## Requirements

- KafkaJS 2.x
- Zod 3.25+ or Zod 4
- a reachable Kafka-compatible broker

```bash
pnpm add @alt-stack/kafka-client-kafkajs kafkajs zod
```

## Usage

```typescript
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";
import { Topics } from "./generated-events.js";

const client = await createKafkaClient({
  kafka: {
    clientId: "billing-publisher",
    brokers: ["localhost:9092"],
  },
  topics: Topics,
  onError: (error) => console.error(error),
});

await client.send(
  "invoice-created",
  { invoiceId: "inv_123" },
  { key: "inv_123" },
);

await client.disconnect();
```

`kafka` may be an existing KafkaJS `Kafka` instance or `KafkaConfig`. `producerConfig` is forwarded to `kafka.producer`. Construction connects immediately.

Payload validation throws `ValidationError`; publishing throws `SendError`; initial connection throws `ConnectionError`. The optional `onError` callback runs before each error is thrown. `client.producer` exposes the KafkaJS `Producer`.

## Documentation

- [Kafka client contract](../../apps/docs/docs/kafka/api/client-core.md)
- [KafkaJS binding API](../../apps/docs/docs/kafka/api/kafkajs.md)

## License

MIT
