# `@alt-stack/zod-asyncapi`

Generate Zod 4 message schemas, TypeScript types, and a typed `Topics` map from AsyncAPI 3-style channels.

## Install

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-asyncapi
```

## Generate

```bash
zod-asyncapi ./asyncapi.json --output ./src/generated-topics.ts
```

`input` may be a local JSON path or HTTP(S) URL. The CLI also supports `--registry`, `--include`, and `--help`.

```typescript
import { Topics, type MessageType } from "./generated-topics.js";

type EmailJob = MessageType<"email.send">;
const job: EmailJob = Topics["email.send"].parse(input);
```

The generator reads channel addresses/messages, not top-level operations. Use one effective payload per channel address and treat the output file as replaceable.

## Documentation

- [Code generation Quickstart](../../apps/docs/docs/codegen/quickstart.md)
- [Common Patterns](../../apps/docs/docs/codegen/common-patterns.md)
- [Zod AsyncAPI API Documentation](../../apps/docs/docs/codegen/api/zod-asyncapi.md)
- [Generated SDK shapes](../../apps/docs/docs/codegen/api/generated-sdks.md)
