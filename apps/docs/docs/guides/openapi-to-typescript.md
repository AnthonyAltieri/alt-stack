# OpenAPI to TypeScript

Generate TypeScript types and Zod schemas from OpenAPI specifications using the `zod-openapi` CLI.

## Installation

```bash
pnpm add @alt-stack/zod-openapi
# or
npm install @alt-stack/zod-openapi
```

## CLI Usage

```bash
npx zod-openapi <input> [options]
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
npx zod-openapi openapi.json

# Generate from URL (e.g., from your running server)
npx zod-openapi http://localhost:3000/docs/openapi.json

# Specify output file
npx zod-openapi openapi.json -o src/api-types.ts
```

## Generated Output

Given an OpenAPI spec, the CLI generates:

- **Zod schemas** for all component schemas
- **TypeScript types** inferred from the Zod schemas
- **Request schemas** for params, query, headers, and body
- **Response schemas** for all status codes
- **Lookup objects** (`Request` and `Response`) for easy access

### Example

For an OpenAPI spec with a `User` schema and `/users/{id}` endpoint:

```typescript
/**
 * This file was automatically generated from OpenAPI schema
 * Do not manually edit this file
 */

import { z } from 'zod';

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});
export type User = z.infer<typeof UserSchema>;

export const GetUsersIdParams = z.object({ id: z.string() });
export const GetUsersId200Response = UserSchema;

export const Request = {
  '/users/{id}': {
    GET: {
      params: GetUsersIdParams,
    },
  },
} as const;

export const Response = {
  '/users/{id}': {
    GET: {
      '200': GetUsersId200Response,
    },
  },
} as const;
```

## Custom String Formats

For custom type mappings (e.g., using Luxon `DateTime` for `iso-date` format), use the `--registry` and `--include` flags.

### Step 1: Create a Registry File

The registry file registers format-to-schema mappings that the CLI uses during code generation:

```typescript title="registry.ts"
import { z } from "zod";
import { registerZodSchemaToOpenApiSchema } from "@alt-stack/zod-openapi";

// Register DateTimeSchema for iso-date and iso-date-time formats
const dateTimeSchema = z.string();
registerZodSchemaToOpenApiSchema(dateTimeSchema, {
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
npx zod-openapi openapi.json \
  -r ./registry.ts \
  -i ./custom-schemas.ts \
  -o src/api-types.ts
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

## Integration with @alt-stack/server

A typical workflow with `@alt-stack/server-hono`:

1. **Define your API** with Zod schemas on the server
2. **Generate OpenAPI spec** using `createDocsRouter`
3. **Generate client types** using the `zod-openapi` CLI

```bash
# Fetch OpenAPI from your running server and generate types
npx zod-openapi http://localhost:3000/docs/openapi.json -o src/api-types.ts
```

This gives you fully typed request/response schemas that match your server's API exactly.

## Programmatic Usage

You can also use the library programmatically:

```typescript
import { openApiToZodTsCode } from "@alt-stack/zod-openapi";

const openApiSpec = {
  components: {
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
  paths: {
    "/users/{id}": {
      get: {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
        },
      },
    },
  },
};

const generatedCode = openApiToZodTsCode(
  openApiSpec,
  ['import { DateTime } from "luxon";'], // custom imports
  { includeRoutes: true }
);

console.log(generatedCode);
```

