# TypeScript/Zod OpenAPI API Documentation

`@alt-stack/zod-openapi` converts an OpenAPI JSON object into TypeScript declarations, Zod 4 schemas, and optional HTTP route maps.

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-openapi
```

The package is ESM-first with CommonJS and type entry points. Its launcher resolves the package-local `tsx` loader and invokes it with the active Node executable; it does not require a global `tsx` or fall back to `npx`. URL inputs require a Node runtime with global `fetch`; Node.js 18 or newer supplies that API. Repository contributor commands use the stricter Node version listed on the documentation home.

## CLI: `zod-openapi`

```text
zod-openapi <input> [options]
```

| Argument/flag | Meaning |
| --- | --- |
| `input` | Required first positional argument. A JSON file path, or an `http://`/`https://` URL. |
| `-o, --output <file>` | Output path. Defaults to `generated-types.ts`. Parent directories are not created. |
| `-r, --registry <file>` | Dynamically imports a TypeScript/JavaScript registry file, resolved from the current working directory. |
| `-i, --include <file>` | Reads a file as UTF-8 and inserts the complete contents after the generated Zod import. |
| `-h, --help` | Prints help and exits successfully. No arguments also prints help and exits successfully. |

The CLI parses local input strictly as JSON; YAML is not accepted. URL fetches must have an OK HTTP status and return JSON. Route generation is always enabled. Success writes the file and logs its path; read, fetch, generation, and write failures print `Error: ...` and exit with status 1.

Flags use the next argument as their value. There is no explicit missing-value or unknown-flag validation beyond that simple lookup.

The long flag names are `--output`, `--registry`, `--include`, and `--help`.

## `openApiToZodTsCode`

```typescript
const openApiToZodTsCode: (
  openapi: Record<string, unknown>,
  customImportLines?: string[],
  options?: { includeRoutes?: boolean },
) => string;
```

Returns source code without writing it. `customImportLines` are inserted verbatim after `import { z } from 'zod';`. Programmatic route generation is off unless `options.includeRoutes` is truthy.

For each `components.schemas` entry the output contains:

- a generated-file header and a scoped `no-useless-escape` lint suppression because source OpenAPI patterns are preserved in emitted regex literals;
- an exported interface for an object, otherwise an exported type alias;
- an exported `<Name>Schema` Zod value;
- a private compile-time equality assertion between the type and `z.infer`;
- any required output aliases for registered custom schemas.

Component schemas are topologically ordered by local `$ref` dependencies. Structurally identical route schemas are aliased to the first canonical schema. Repeated response error structures may receive a semantic `<ErrorCode>ErrorSchema` name when their shape contains `error.code` with a single enum value.

When routes are enabled, every parsed route appears in `Request`, including `{}` for a method without params/query/headers/body. `Response` contains each JSON response status with a schema. Both maps use uppercase methods and end with `as const`.

The function does not validate that the input is a complete OpenAPI document. Missing components produce no component declarations; missing paths produce no route maps.

## `convertSchemaToZodString`

```typescript
function convertSchemaToZodString(schema: AnySchema): string;
```

Returns a Zod expression as text. It does not evaluate or import Zod.

| OpenAPI shape | Emitted expression |
| --- | --- |
| local `$ref` | `<ComponentName>Schema` |
| `oneOf` | `z.union([...])` |
| `allOf` | nested two-argument `z.intersection(...)` |
| string enum | `z.enum([...])` |
| string | `z.string()` plus supported format/length/pattern modifiers |
| number | `z.number()` plus min/max |
| integer | `z.number().int()` plus min/max |
| boolean | `z.boolean()` |
| array | `z.array(item)` plus min/max items |
| object with properties | `z.object({...})`; non-required properties become optional |
| empty/free-form object | `z.record(z.string(), z.unknown())` |
| unknown or unsupported | `z.unknown()` |

`nullable: true` appends `.nullable()`. `additionalProperties: false` appends `.strict()`; a typed `additionalProperties` schema is not represented when ordinary properties exist.

Built-in modifiers are `email -> .email()`, `url`/`uri -> .url()`, `uuid -> .uuid()`, `date -> .date()`, `date-time -> .datetime()`, and `color-hex -> a six-digit regex`. `iso-date`, `iso-date-time`, `objectid`, and unknown formats retain a plain string unless registered. Format and explicit pattern metadata are also stored through `.meta({ openapi: ... })` for round-tripping.

Current input constraints matter: `anyOf` is recognized by `schemaToTypeString` but not by this Zod converter; schema component names must form valid TypeScript identifiers; enum strings and regular-expression patterns are interpolated into generated literals without general source escaping. Validate or constrain schema names and literal contents before generation.

## Type rendering

### `schemaToTypeString`

```typescript
function schemaToTypeString(schema: AnySchema, options?: { outputSchemaNames?: Set<string> }): string;
```

Returns a TypeScript type expression. It supports local `$ref` values (URI-decoded), `oneOf`, `anyOf`, `allOf`, string and numeric enums, primitives, arrays, object properties, typed/untyped additional properties, and `nullable`. Unknown shapes become `unknown`. Registered custom types render as a generated `z.output<typeof Name>` alias when an `outputSchemaNames` set is supplied.

### `generateInterface`

```typescript
function generateInterface(
  name: string,
  schema: AnySchema,
  options?: { outputSchemaNames?: Set<string> },
): string;
```

Returns `export interface <name> { ... }` for object-like schemas and `export type <name> = ...;` otherwise. Required properties omit `?`; other properties are optional. Invalid property identifiers are single-quoted. `additionalProperties: true` adds `[key: string]: unknown`; a schema adds a typed index signature.

The optional options shape is structurally callable but its `SchemaToTypeOptions` name is not exported from the package entry point.

## Custom-schema registry

### `SUPPORTED_STRING_FORMATS` and `SupportedStringFormat`

`SUPPORTED_STRING_FORMATS` is the readonly tuple:

```text
color-hex, date, date-time, email, iso-date, iso-date-time,
objectid, uri, url, uuid
```

`SupportedStringFormat` is its element union. Registration types intentionally accept arbitrary string formats too; the tuple describes the built-in vocabulary, not a runtime allowlist for this TypeScript package.

### Registration types

`ZodOpenApiRegistrationString<F>` has `schemaExportedVariableName`, `type: "string"`, `format`, and optional `description`.

`ZodOpenApiRegistrationStrings<Fs>` replaces `format` with a readonly `formats` list, mapping several formats to one schema.

`ZodOpenApiRegistrationPrimitive` has `schemaExportedVariableName`, optional `description`, and `type: "number" | "integer" | "boolean"`.

`ZodOpenApiRegistration` is the union of those three shapes.

### `registerZodSchemaToOpenApiSchema`

```typescript
function registerZodSchemaToOpenApiSchema(
  schema: z.ZodTypeAny,
  registration: ZodOpenApiRegistration,
): void;
```

Stores the mapping in the process-global `schemaRegistry`. A duplicate string `(type, format)` belonging to a different Zod schema object throws. Re-registering the same schema object replaces its registration. Primitive registrations are not checked for duplicates; later entries coexist and lookup returns the first matching insertion.

The TypeScript type renderer consults primitive registrations, but the current Zod converter does not. Registering `number`, `integer`, or `boolean` can therefore affect a generated interface/output alias without replacing the corresponding built-in Zod schema; use primitive registrations only after verifying the generated compile-time equality assertion.

The registered name must identify a value available in generated-module scope through an include line or another declaration.

### Other registry exports

- `getSchemaExportedVariableNameForStringFormat(format)` returns a registered name or `undefined`.
- `clearZodSchemaToOpenApiSchemaRegistry()` removes every registration.
- `schemaRegistry` exposes `register`, `getOpenApiSchema`, `isRegistered`, `clear`, `getSchemaExportedVariableNameForStringFormat`, and `getSchemaExportedVariableNameForPrimitiveType` methods. The registry class itself is not a named export.

The global registry persists across calls in one process. Clear it between unrelated generation jobs or tests.

## Route parsing

### Types

`HttpMethod` is `"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"`.

`RouteParameter` has `name`, `in: "path" | "query" | "header" | "cookie"`, `required`, and `schema`.

`RouteInfo` has `path`, `method`, combined `parameters`, optional `requestBody`, and `responses: Record<string, AnySchema>`.

`RouteSchemaNames` has optional `paramsSchemaName`, `querySchemaName`, `headersSchemaName`, `bodySchemaName`, and `responseSchemaName`.

`AnySchema` is `Record<string, any>`. `OpenAPIObjectSchema.type` is the required literal `"object"`; the remaining optional fields are `properties`, `required`, `additionalProperties`, `maxProperties`, and `minProperties`.

### `parseOpenApiPaths`

```typescript
function parseOpenApiPaths(openapi: Record<string, unknown>): RouteInfo[];
```

Visits the seven supported operation keys in document order. Path-level parameters are appended before operation-level parameters; duplicates are not resolved. Missing parameter `name`, `in`, `required`, or `schema` values fall back to `""`, `"query"`, `false`, and `{}`. It extracts only inline parameter objects, `application/json` request bodies, and `application/json` response schemas. Cookie parameters are retained in `RouteInfo` but route schema generation does not create a cookie schema.

### `generateRouteSchemaNames`

```typescript
function generateRouteSchemaNames(route: RouteInfo): RouteSchemaNames;
```

Builds PascalCase names from method, path segments (including unwrapped path tokens), and a suffix. It adds names for present path/query/header parameters and a request body. `responseSchemaName` is set to a generic `...Response` only when at least one response code starts with `2`; the main code generator creates status-specific response names instead.

## Export checklist

The entry point exports every symbol documented above: `openApiToZodTsCode`, `registerZodSchemaToOpenApiSchema`, `clearZodSchemaToOpenApiSchemaRegistry`, `getSchemaExportedVariableNameForStringFormat`, `SUPPORTED_STRING_FORMATS`, `schemaRegistry`, `SupportedStringFormat`, `ZodOpenApiRegistrationString`, `ZodOpenApiRegistrationStrings`, `ZodOpenApiRegistrationPrimitive`, `ZodOpenApiRegistration`, `convertSchemaToZodString`, `generateInterface`, `schemaToTypeString`, `parseOpenApiPaths`, `generateRouteSchemaNames`, `HttpMethod`, `RouteParameter`, `RouteInfo`, `RouteSchemaNames`, `AnySchema`, and `OpenAPIObjectSchema`.
