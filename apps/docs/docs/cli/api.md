# `@alt-stack/cli` API Documentation

Package: `@alt-stack/cli`

The CLI package defines typed arguments and options, immutable procedures, hierarchical command routers, a process-independent execution application, and an injected-I/O terminal runner. Zod supplies runtime parsing and output inference; command handlers use `@alt-stack/result`.

## Initialization

### `initCli<TContext>()`

Creates one context-bound definition factory. The default `TContext` is an empty record. Use the same factory for every router and procedure that will be composed.

### `InitCliResult<TContext>`

The object returned by `initCli`:

| Member | Behavior |
| --- | --- |
| `router(config, metadata?)` | builds a validated hierarchical router while preserving literal command paths |
| `combineRouters(...routers)` | merges routers with distinct root commands and the same base context |
| `procedure` | starts an immutable `CliProcedureBuilder` for `TContext` |
| `argument(schema, metadata?)` | declares one positional argument |
| `variadicArgument(elementSchema, metadata?)` | declares the final zero-or-more positional argument |
| `option(schema, metadata?)` | declares a value-taking long option and optional short spelling |
| `flag(metadata?)` | declares a boolean option that defaults to `false` |

The procedure builder supports:

| Method | Behavior |
| --- | --- |
| `.description(text)` | sets command help text and returns a new builder |
| `.args(descriptors)` | appends positional descriptors in object insertion order |
| `.options(descriptors)` | appends value-option or flag descriptors |
| `.use(middleware)` | appends context-aware middleware and carries its context override to later stages |
| `.command(handler)` | creates the executable leaf command |

An optional positional argument cannot precede a required one, and one variadic argument may appear only at the end. Option keys become kebab-case long names; invalid names, duplicate long/short names, and collisions with `help` or `version` throw `CliDefinitionError` while the tree is defined.

## Argument and option descriptors

All descriptor schemas are Zod schemas. Inferred handler fields use Zod output types, so defaults, coercions, transforms, and async parsing are reflected after validation.

### `ArgumentMetadata<TOptional>`

| Property | Meaning |
| --- | --- |
| `description` | optional help text for the positional argument |
| `metavar` | optional display name in usage/help output |
| `optional` | when `true`, wraps the schema with `optional()` and permits an omitted token |

### `ArgumentDescriptor<TSchema>`

The frozen descriptor returned by `argument`.

| Property | Meaning |
| --- | --- |
| `kind` | the literal discriminant `"argument"` |
| `schema` | effective Zod schema, including the optional wrapper when requested |
| `description` | copied help description |
| `metavar` | copied display name |
| `optional` | whether the CLI grammar permits omission |

### `VariadicArgumentMetadata`

| Property | Meaning |
| --- | --- |
| `description` | optional help text for the positional collection |
| `metavar` | optional singular display name used before `...` |

### `VariadicArgumentDescriptor<TSchema>`

The frozen descriptor returned by `variadicArgument`.

| Property | Meaning |
| --- | --- |
| `kind` | the literal discriminant `"variadic-argument"` |
| `schema` | a Zod array around the supplied element schema |
| `description` | copied help description |
| `metavar` | copied display name |

### `OptionMetadata`

| Property | Meaning |
| --- | --- |
| `description` | optional help text for the option |
| `metavar` | optional value label in help output |
| `short` | optional single alphanumeric short name other than reserved `h` |

### `OptionDescriptor<TSchema>`

The frozen descriptor returned by `option`.

| Property | Meaning |
| --- | --- |
| `kind` | the literal discriminant `"option"` |
| `schema` | Zod schema applied to the string value or `undefined` |
| `description` | copied help description |
| `metavar` | copied value label |
| `short` | copied one-character short name |

### `FlagMetadata`

| Property | Meaning |
| --- | --- |
| `description` | optional help text for the flag |
| `short` | optional single alphanumeric short name other than reserved `h` |

### `FlagDescriptor<TSchema>`

The frozen descriptor returned by `flag`.

| Property | Meaning |
| --- | --- |
| `kind` | the literal discriminant `"flag"` |
| `schema` | a boolean Zod schema with default `false` |
| `description` | copied help description |
| `short` | copied one-character short name |

### `InferDescriptor<TDescriptor>`

Extracts the `z.output` type from one descriptor's schema.

### `InferDescriptorMap<TMap>`

Maps every descriptor key to its `InferDescriptor` output. All declared keys exist on normalized command input; an omitted optional option therefore has an explicit `undefined` value.

## Command input and handlers

### `CommandInput<TArguments, TOptions>`

Contains `args`, the normalized positional descriptor map, and `options`, the normalized value-option/flag descriptor map.

### `CommandHandler<TContext, TArguments, TOptions, TValue, TError>`

Receives `{ input, ctx }` and returns `Result<TValue, TError>` synchronously or asynchronously. `TError` must satisfy `ResultError`; returning a non-Result value is rejected at runtime.

## Middleware

### `MiddlewareFunction<TContext, TContextOverride>`

Receives `{ ctx, next }`. Calling `next()` preserves the current context object. Calling `next({ ctx: override })` shallowly composes the plain-object override for downstream middleware and the handler, and overwrites corresponding fields in the inferred handler context.

Middleware must return the exact result of its one `next` call. It may instead return `err(resultError)` before calling `next` to short-circuit. The continuation is lazy until its promise is consumed by awaiting, returning, or chaining it. Once consumed, downstream effects are not rolled back if middleware later returns a different result. Calling `next` more than once, replacing its returned result, or reusing a result from another invocation becomes a `command-error`; an unconsumed continuation cannot run downstream after middleware settlement.

## Routers

### `RouterMetadata`

| Property | Meaning |
| --- | --- |
| `description` | optional router-group description rendered in group help |

Router keys must be one token beginning with a letter or number and then containing letters, numbers, hyphens, or underscores. Configs must expose commands as own properties on a standard or null-prototype object. A node is another router or a terminal command. Selecting a router group without a child command returns that group's help.

### `RouterCommandPaths<TRouter>`

Extracts the router's executable leaf paths as a string-literal union. A tree containing `users.create` and root `status` commands produces `"users create" | "status"`.

## Application creation

### `createCli(options)`

Validates the CLI identity and returns a `CliApplication`. The function does not read `process.argv`, write streams, or exit the process.

### `CreateCliOptions<TContext, TCommandPath>`

| Property | Meaning |
| --- | --- |
| `name` | one non-empty executable token used in help |
| `version` | non-empty version text returned for root `--version` |
| `description` | optional root help description |
| `router` | root router from the matching `initCli<TContext>()` factory |
| `createContext(options)` | creates a plain-object `TContext` container once after routing and input validation for an executable command |

The context container must have a standard or null prototype. Class-based services remain supported as properties of that plain container; returning a class instance as the container produces a `command-error` before middleware or the handler runs.

### `CliContextFactoryOptions<TCommandPath>`

| Property | Meaning |
| --- | --- |
| `commandPath` | inferred executable path such as `"users create"` |
| `input` | normalized readonly `args` and `options` records passed to the selected command |

### `CliApplication<TCommandPath>`

| Member | Meaning |
| --- | --- |
| `execute(argv)` | resolves an explicit `CliOutcome` for application-only argument tokens |

Definition errors may be thrown while constructing the CLI. For a valid definition, routing/validation is represented as usage outcomes and context/middleware/handler failures are represented as command-error outcomes.

## Outcomes

### `CliOutcome<TCommandPath>`

The discriminated union of `CliExecutedOutcome`, `CliHelpOutcome`, `CliVersionOutcome`, `CliUsageErrorOutcome`, and `CliCommandErrorOutcome`. Narrow on `type`.

### `CliExecutedOutcome<TCommandPath>`

| Property | Meaning |
| --- | --- |
| `type` | `"executed"` |
| `exitCode` | literal `0` |
| `commandPath` | selected inferred executable path |
| `value` | successful handler value, exposed as `unknown` in v1 |

### `CliHelpOutcome`

| Property | Meaning |
| --- | --- |
| `type` | `"help"` |
| `exitCode` | literal `0` |
| `commandPath` | root/group/command path as string tokens |
| `text` | rendered contextual help |

### `CliVersionOutcome`

| Property | Meaning |
| --- | --- |
| `type` | `"version"` |
| `exitCode` | literal `0` |
| `text` | configured version string |

### `CliUsageErrorOutcome`

| Property | Meaning |
| --- | --- |
| `type` | `"usage-error"` |
| `exitCode` | literal `2` |
| `error` | structured `CliUsageError` |
| `help` | nearest relevant router or command help text |

### `CliCommandErrorOutcome<TCommandPath>`

| Property | Meaning |
| --- | --- |
| `type` | `"command-error"` |
| `exitCode` | literal `1` |
| `commandPath` | selected inferred executable path |
| `error` | original schema-execution, context, middleware, handler, or Result error as `unknown` |

## Terminal runner

### `runCli(application, options)`

Executes the application, renders its outcome to injected writers, and resolves exit code `0`, `1`, or `2`. It never assigns `process.exitCode` itself.

### `CliWriter`

| Member | Meaning |
| --- | --- |
| `write(text)` | accepts rendered text; Node writable streams satisfy this interface |

### `RunCliOptions`

| Property | Meaning |
| --- | --- |
| `argv` | application arguments, normally `process.argv.slice(2)` |
| `stdout` | receives help, version, and optionally formatted success values |
| `stderr` | receives usage and command errors |
| `formatValue` | optional successful-value formatter; `undefined` suppresses output |
| `formatError` | optional command-error formatter; defaults to `Error.message` or `String(error)` |

## Definition and usage errors

### `CliDefinitionError`

`new CliDefinitionError(code, message)` extends `Error` and is thrown for an invalid static command tree.

| Member | Meaning |
| --- | --- |
| `constructor` | accepts a `CliDefinitionErrorCode` and human-readable message |
| `code` | stable definition-error category |

### `CliDefinitionErrorCode`

The union `"invalid-cli-identity" | "invalid-command-name" | "invalid-argument-definition" | "invalid-option-definition" | "command-conflict"`.

### `CliUsageError`

`new CliUsageError(code, message, commandPath, issues?)` extends `Error` and is returned inside a usage outcome.

| Member | Meaning |
| --- | --- |
| `constructor` | accepts the code, message, nearest command path, and optional Zod issues |
| `code` | stable usage-error category |
| `commandPath` | token path used to select contextual help |
| `issues` | optional Zod issue list for invalid schema input |

### `CliUsageErrorCode`

The union `"unknown-command" | "unknown-option" | "missing-option-value" | "duplicate-option" | "invalid-input" | "unexpected-argument"`.

## Result re-exports

For command implementations, the package re-exports `ok`, `err`, `isOk`, `isErr`, `TaggedError`, `Result`, `ResultError`, `Ok`, and `Err` from `@alt-stack/result`. Their complete contracts are documented in the [Result API](../result/api.md).
