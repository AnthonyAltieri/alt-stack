# AsyncAPI to TypeScript

Generate TypeScript types and Zod schemas from AsyncAPI specifications using the `zod-asyncapi` CLI.

## Installation

```bash
pnpm add @alt-stack/zod-asyncapi
# or
npm install @alt-stack/zod-asyncapi
```

## CLI Usage

```bash
npx zod-asyncapi <input> [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file path (default: `generated-types.ts`) |
| `-r, --registry <file>` | Registry file that registers custom schemas |
| `-i, --include <file>` | TypeScript file to include at top of generated output |
| `-h, --help` | Show help message |

### Basic Examples

```bash
# Generate from local file
npx zod-asyncapi asyncapi.json

# Generate from URL (e.g., from your running Kafka producer)
npx zod-asyncapi http://localhost:3000/asyncapi.json

# Specify output file
npx zod-asyncapi asyncapi.json -o src/kafka-types.ts
```

## Generated Output

Given an AsyncAPI spec, the CLI generates:

- **Zod schemas** for all component schemas
- **TypeScript types** inferred from the Zod schemas
- **Message schemas** for each topic
- **Topics lookup object** for easy schema access

### Example

For an AsyncAPI spec with a `User` schema and `user-events` topic:

```typescript
/**
 * This file was automatically generated from AsyncAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

// Component Schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
});
export type User = z.infer<typeof UserSchema>;

// Topic Message Schemas
export const UserEventsMessageSchema = UserSchema;
export type UserEventsMessage = z.infer<typeof UserEventsMessageSchema>;

// Topics Object
export const Topics = {
  'user-events': UserEventsMessageSchema
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
```

## Using Generated Types with Kafka Client

The generated `Topics` object works directly with `@alt-stack/kafka-client-kafkajs` or `@alt-stack/kafka-client-warpstream`:

### KafkaJS Producer

```typescript
import { Topics } from "./generated-types";
import { createKafkaClient } from "@alt-stack/kafka-client-kafkajs";

const client = await createKafkaClient({
  kafka: { brokers: ["localhost:9092"], clientId: "my-producer" },
  topics: Topics,
});

// Type-safe sending - topic names and message shapes are validated
await client.send("user-events", {
  id: "123",
  name: "John",
  email: "john@example.com",
});

await client.disconnect();
```

### WarpStream Producer

```typescript
import { Topics } from "./generated-types";
import { createWarpStreamClient } from "@alt-stack/kafka-client-warpstream";

const client = await createWarpStreamClient({
  bootstrapServer: "my-cluster.warpstream.com:9092",
  topics: Topics,
});

await client.send("user-events", {
  id: "123",
  name: "John",
  email: "john@example.com",
});
```

## Custom String Formats

For custom type mappings (e.g., using Luxon `DateTime` for `iso-date` format), use the `--registry` and `--include` flags.

### Step 1: Create a Registry File

The registry file registers format-to-schema mappings that the CLI uses during code generation:

```typescript title="registry.ts"
import { z } from "zod";
import { registerZodSchemaToAsyncApiSchema } from "@alt-stack/zod-asyncapi";

// Register DateTimeSchema for iso-date and iso-date-time formats
const dateTimeSchema = z.string();
registerZodSchemaToAsyncApiSchema(dateTimeSchema, {
  schemaExportedVariableName: "DateTimeSchema",
  type: "string",
  formats: ["iso-date", "iso-date-time"],
});
```

### Step 2: Create an Include File

The include file contains imports and schema definitions that will be injected at the top of the generated output:

```typescript title="custom-schemas.ts"
import { DateTime } from "luxon";

export const DateTimeSchema = z
  .string()
  .transform((v) => DateTime.fromISO(v));
```

### Step 3: Run the CLI

```bash
npx zod-asyncapi asyncapi.json \
  -r ./registry.ts \
  -i ./custom-schemas.ts \
  -o src/kafka-types.ts
```

The generated output will:
1. Include the contents of `custom-schemas.ts` at the top
2. Use `DateTimeSchema` for any fields with `format: "iso-date"` or `format: "iso-date-time"`

### Supported String Formats

The following string formats can be registered:

- `color-hex`
- `date`
- `date-time`
- `email`
- `iso-date`
- `iso-date-time`
- `objectid`
- `uri`
- `url`
- `uuid`

## Workflow: Server to Client

A typical workflow:

1. **Server defines Kafka topics** with Zod schemas using `@alt-stack/kafka-core`
2. **Server exposes AsyncAPI spec** at an endpoint
3. **Client generates types** using `zod-asyncapi`
4. **Client uses Kafka client** with generated types

```bash
# Generate types from running server
npx zod-asyncapi http://localhost:3000/asyncapi.json -o src/kafka-types.ts
```

## Programmatic Usage

You can also use the library programmatically:

```typescript
import { asyncApiToZodTsCode } from "@alt-stack/zod-asyncapi";

const asyncApiSpec = {
  asyncapi: "3.0.0",
  info: { title: "My API", version: "1.0.0" },
  channels: {
    userEvents: {
      address: "user-events",
      messages: {
        UserCreated: { $ref: "#/components/messages/UserCreated" },
      },
    },
  },
  components: {
    messages: {
      UserCreated: {
        payload: { $ref: "#/components/schemas/User" },
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      },
    },
  },
};

const generatedCode = asyncApiToZodTsCode(
  asyncApiSpec,
  ['import { DateTime } from "luxon";'], // custom imports
);

console.log(generatedCode);
```
