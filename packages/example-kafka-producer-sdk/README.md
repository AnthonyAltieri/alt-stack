# `@alt-stack/example-kafka-producer-sdk`

Generated TypeScript/Zod snapshot for the repository's example Kafka producer AsyncAPI document.

> This is topic-specific generated output, not a hand-authored Kafka-client API. Regeneration may change any schema or topic alias.

## Use the snapshot

```bash
pnpm add @alt-stack/example-kafka-producer-sdk zod
```

```typescript
import { Topics, type MessageType } from "@alt-stack/example-kafka-producer-sdk";

const message: MessageType<"notifications"> = Topics.notifications.parse({
  type: "welcome",
  recipient: "ada@example.com",
  message: "Hello",
});
```

Zod 4 is required as a peer. `src/index.ts` is generated and must not be hand-edited.

## Documentation

- [Generated export inventory](../../apps/docs/docs/codegen/api/generated-sdks.md)
- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Zod AsyncAPI API Documentation](../../apps/docs/docs/codegen/api/zod-asyncapi.md)
