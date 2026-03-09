# zod-asyncapi

Convert AsyncAPI schemas to Zod schemas with TypeScript code generation.

## Features

- Converts AsyncAPI 3.x schemas to Zod validation schemas
- Generates TypeScript code with Zod schemas and inferred types
- Handles complex types: objects, arrays, unions (oneOf), intersections (allOf)
- Supports custom string formats via registry system
- Generates Topics lookup object for easy message schema access
- Supports nullable schemas, enums, validation constraints, and more

## Installation

```bash
pnpm add @alt-stack/zod-asyncapi
# or
npm install @alt-stack/zod-asyncapi
# or
yarn add @alt-stack/zod-asyncapi
```

## CLI Usage

Generate TypeScript types directly from the command line:

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

### Basic CLI Example

```bash
# Generate from local file
npx zod-asyncapi asyncapi.json

# Generate from URL
npx zod-asyncapi http://localhost:3000/asyncapi.json

# Specify output file
npx zod-asyncapi asyncapi.json -o src/kafka-types.ts
```

### Custom Schemas with CLI

For custom type mappings (e.g., using Luxon DateTime for `iso-date` format), create a registry file and an include file:

**registry.ts** - Registers format-to-schema mappings:

```typescript
import { z } from "zod";
import { registerZodSchemaToAsyncApiSchema } from "@alt-stack/zod-asyncapi";

// Register DateTime schema for iso-date and iso-date-time formats
const dateTimeSchema = z.string();
registerZodSchemaToAsyncApiSchema(dateTimeSchema, {
  schemaExportedVariableName: "DateTimeSchema",
  type: "string",
  formats: ["iso-date", "iso-date-time"],
});
```

**custom-schemas.ts** - Included in generated output:

```typescript
import { DateTime } from "luxon";

export const DateTimeSchema = z
  .string()
  .transform((v) => DateTime.fromISO(v));
```

**Run the CLI:**

```bash
npx zod-asyncapi asyncapi.json \
  -r ./registry.ts \
  -i ./custom-schemas.ts \
  -o src/kafka-types.ts
```

The generated output will include your custom schemas and use `DateTimeSchema` for any fields with `format: "iso-date"` or `format: "iso-date-time"`.

## Programmatic Usage

### Basic Example

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
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
        },
        required: ["id", "name", "email"],
      },
    },
  },
};

const generatedCode = asyncApiToZodTsCode(asyncApiSpec);
console.log(generatedCode);
```

Generated output:

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

### Custom String Formats

Register custom Zod schemas for AsyncAPI string formats:

```typescript
import {
  registerZodSchemaToAsyncApiSchema,
  asyncApiToZodTsCode,
} from "@alt-stack/zod-asyncapi";
import { z } from "zod";

// Register a custom UUID schema
const uuidSchema = z.string().uuid();
registerZodSchemaToAsyncApiSchema(uuidSchema, {
  schemaExportedVariableName: "uuidSchema",
  type: "string",
  format: "uuid",
});

// Now AsyncAPI schemas with format: "uuid" will use your custom schema
const asyncApiSpec = {
  asyncapi: "3.0.0",
  info: { title: "My API", version: "1.0.0" },
  components: {
    schemas: {
      Event: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
        },
      },
    },
  },
};

const code = asyncApiToZodTsCode(asyncApiSpec, [
  'import { uuidSchema } from "./custom-schemas";',
]);
```

### Supported String Formats

The following string formats are supported out of the box:

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

## API Reference

### `asyncApiToZodTsCode(asyncapi, customImportLines?)`

Converts an AsyncAPI specification to TypeScript code containing Zod schemas.

**Parameters:**
- `asyncapi`: AsyncAPI specification object
- `customImportLines`: Optional array of custom import statements to include

**Returns:** `string` - Generated TypeScript code

### `convertSchemaToZodString(schema)`

Converts a single AsyncAPI/JSON schema to a Zod expression string.

**Parameters:**
- `schema`: AsyncAPI schema object

**Returns:** `string` - Zod expression as a string (e.g., `"z.string()"`)

### `registerZodSchemaToAsyncApiSchema(schema, registration)`

Registers a Zod schema with its AsyncAPI representation for custom string formats.

**Parameters:**
- `schema`: Zod schema instance
- `registration`: Registration object describing the AsyncAPI type/format

### `clearZodSchemaToAsyncApiSchemaRegistry()`

Clear all registered schemas in the global registry.

## Supported AsyncAPI Schema Features

- ✅ Basic types: `string`, `number`, `integer`, `boolean`
- ✅ Objects with `properties` and `required`
- ✅ Arrays with `items`
- ✅ Unions (`oneOf`)
- ✅ Intersections (`allOf`)
- ✅ Nullable schemas
- ✅ Enums
- ✅ String formats (email, date, uuid, etc.)
- ✅ Validation constraints (`minLength`, `maxLength`, `pattern`, `minimum`, `maximum`, etc.)
- ✅ Schema references (`$ref`)
- ✅ Additional properties
- ✅ Topics lookup object for message schemas

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck
```


