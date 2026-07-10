# TypeScript/Zod AsyncAPI API Documentation

`@alt-stack/zod-asyncapi` converts AsyncAPI 3-style channels into Zod 4 component/message schemas and a topic-to-schema map.

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-asyncapi
```

The package is ESM-first with CommonJS and type entry points. Its launcher resolves the package-local `tsx` loader and invokes it with the active Node executable; it does not require a global `tsx` or fall back to `npx`. URL input requires a Node runtime with global `fetch`; Node.js 18 or newer supplies that API. Repository contributor commands use the stricter Node version listed on the documentation home.

## CLI: `zod-asyncapi`

```text
zod-asyncapi <input> [options]
```

| Argument/flag | Meaning |
| --- | --- |
| `input` | Required first positional JSON file path or `http://`/`https://` URL. |
| `-o, --output <file>` | Output file; defaults to `generated-types.ts`. Parent directories are not created. |
| `-r, --registry <file>` | Dynamically imports a registry file resolved from the current working directory. |
| `-i, --include <file>` | Inserts the complete UTF-8 file contents after the Zod import. |
| `-h, --help` | Prints help and exits successfully. No arguments does the same. |

Local input is parsed strictly as JSON; YAML is not accepted. URL input must return an OK status and JSON body. Success logs and writes the generated path. Read, fetch, generation, and write failures print `Error: ...` and exit 1. Flag values use simple next-argument lookup; unknown or value-less flags do not receive separate validation.

The long flag names are `--output`, `--registry`, `--include`, and `--help`.

## `asyncApiToZodTsCode`

```typescript
function asyncApiToZodTsCode(
  asyncapi: AsyncAPISpec,
  customImportLines?: string[],
): string;
```

Returns TypeScript source without writing it. Custom lines are inserted verbatim after `import { z } from 'zod';`.

The generated-file header includes a scoped `no-useless-escape` lint suppression because source AsyncAPI patterns are preserved in emitted regex literals.

Generation reads `components.schemas` in document insertion order and emits `<Name>Schema` plus `type <Name> = z.infer<...>`. It then reads each `channels` entry:

1. uses `channel.address` as the topic key;
2. resolves inline messages or local `#/components/messages/...` references;
3. resolves a local `#/components/schemas/...` payload reference to that component's schema;
4. emits a `<Topic>MessageSchema`/type unless an identical component or earlier topic schema is canonical;
5. emits `Topics`, `TopicName`, and `MessageType<T>`.

Topic names are split on `/`, `-`, `_`, and `.` for generated PascalCase identifiers. `Topics` keeps only the first occurrence of each address. Use one effective message payload per channel address; multiple messages are not represented as a message-name union.

Top-level AsyncAPI `operations` are not consulted. Missing payloads become `z.unknown()`. Component declarations are not topologically sorted, so put a referenced component before a component whose initializer uses it.

## `convertSchemaToZodString`

```typescript
function convertSchemaToZodString(schema: AnySchema): string;
```

Returns a Zod expression as source text.

| Schema shape | Output |
| --- | --- |
| local schema `$ref` | `<Name>Schema` |
| local message `$ref` | `<Name>PayloadSchema` |
| `oneOf` | `z.union([...])` |
| `allOf` | `z.intersection(...)` |
| string enum | `z.enum([...])` |
| string | Zod string with email/url/uuid, length, and pattern modifiers |
| number/integer | `z.number()` with integer/min/max modifiers |
| boolean | `z.boolean()` |
| array | `z.array(...)` with min/max items |
| object | Zod object with optional non-required properties |
| empty/free-form object | `z.record(z.string(), z.unknown())` |
| unsupported | `z.unknown()` |

`nullable: true` wraps the result in `z.union([result, z.null()])`. `additionalProperties: false` makes objects strict. A schema-valued `additionalProperties` is not preserved.

Current source-generation constraints:

- object property names are emitted without quoting and therefore must be valid JavaScript identifiers;
- enum strings and regex patterns are interpolated without general TypeScript/regex-literal escaping;
- `allOf` generation passes every member as arguments to one `z.intersection` call, while Zod's intersection API is binary—limit AsyncAPI intersections to two members;
- `anyOf`, discriminator semantics, external references, and non-JSON message encodings are not implemented.

## Custom format registry

`SUPPORTED_STRING_FORMATS` is a runtime array containing `color-hex`, `date`, `date-time`, `email`, `iso-date`, `iso-date-time`, `objectid`, `uri`, `url`, and `uuid`.

### Registration types

`ZodAsyncApiRegistrationString` has `schemaExportedVariableName`, `type: "string"`, `format`, and optional `description`.

`ZodAsyncApiRegistrationStrings` replaces `format` with a readonly `formats` array.

`ZodAsyncApiRegistrationPrimitive` has `schemaExportedVariableName`, optional `description`, and `type: "number" | "integer" | "boolean"`.

`ZodAsyncApiRegistration` is their union.

### `registerZodSchemaToAsyncApiSchema`

```typescript
function registerZodSchemaToAsyncApiSchema(
  schema: z.ZodTypeAny,
  asyncApiSchema: ZodAsyncApiRegistration,
): void;
```

Stores a process-global registration. Duplicate string `(type, format)` pairs belonging to different schema objects throw; registering the same schema object again replaces its entry. The registered `schemaExportedVariableName` must be in generated-module scope through an include file or other declaration.

The public primitive registration shape is stored but the current converter consults only string-format registrations. Number, integer, and boolean output therefore remains built-in.

### Lookups and clearing

- `getSchemaExportedVariableNameForStringFormat(format)` returns the first registered schema name or `undefined`.
- `clearZodSchemaToAsyncApiSchemaRegistry()` clears all global registrations.

The internal `schemaRegistry` value is not re-exported from the package entry point.

## Input model types

`AnySchema` is `Record<string, unknown>`.

`AsyncAPISpec` requires `asyncapi` and `info: { title; version; description? }`; it optionally contains `channels`, `operations`, and component `schemas`/`messages`.

`AsyncAPIChannel` has required `address` and optional `messages`, whose values are message references or inline `AsyncAPIMessage` objects.

`AsyncAPIOperation` has `action: "send" | "receive"`, a channel reference, and optional message references. It describes accepted input typing but does not influence generation.

`AsyncAPIMessage` has optional `name`, `contentType`, and `payload` (a local reference or inline schema). `contentType` is not used by conversion.

`TopicInfo` is the generator's public structural type with `topic`, `messageName`, and `payloadSchema: AnySchema | null`.

## Generated output types

```typescript
export const Topics = {
  "email.send": EmailSendMessageSchema,
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
```

These three identifiers are generated artifacts, not exports of `@alt-stack/zod-asyncapi` itself.

## Export checklist

The package entry point exports `asyncApiToZodTsCode`, `convertSchemaToZodString`, `registerZodSchemaToAsyncApiSchema`, `getSchemaExportedVariableNameForStringFormat`, `clearZodSchemaToAsyncApiSchemaRegistry`, `SUPPORTED_STRING_FORMATS`, `ZodAsyncApiRegistration`, `ZodAsyncApiRegistrationString`, `ZodAsyncApiRegistrationStrings`, `ZodAsyncApiRegistrationPrimitive`, `AnySchema`, `AsyncAPISpec`, `AsyncAPIChannel`, `AsyncAPIOperation`, `AsyncAPIMessage`, and `TopicInfo`.
