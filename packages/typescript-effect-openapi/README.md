# @alt-stack/effect-openapi

Generate native Effect v4 `Schema`, `HttpApiEndpoint`, `HttpApiGroup`, and `HttpApi` declarations from a self-contained OpenAPI 3.0 or 3.1 document. Generated SDKs use Effect directly and do not depend on an alt-stack client runtime.

The generator requires Node.js 22.19 or newer, matching the pinned upstream toolchain's dependencies.

## Generate

```sh
pnpm add -D @alt-stack/effect-openapi
pnpm add effect@4.0.0-rc.112
pnpm exec effect-openapi openapi.json -o src/generated/api.ts
```

The CLI accepts a local JSON file. Omit `-o` to write TypeScript to stdout. Output files are written only after validation and generation succeed; their parent directory must exist.

Generation uses `@effect/openapi-generator` in `httpapi` mode. The exported contract is named `Api`. The first OpenAPI tag determines an operation's group; `operationId` determines its client method name using upstream naming rules. Untagged operations are top-level client methods. Without an `operationId`, upstream uses a method/path-derived name, which may require bracket notation. Prefer explicit tags and operation identifiers for a stable SDK API.

## Consume

For a spec with tag `todos` and operation ID `byId`:

```ts
import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { HttpApiClient } from "effect/unstable/httpapi";
import { Api } from "./generated/api.js";

const program = Effect.gen(function* () {
  const client = yield* HttpApiClient.make(Api, {
    baseUrl: "https://api.example.com",
  });
  return yield* client.todos.byId({ params: { id: "1" } });
});

const todo = await Effect.runPromise(
  program.pipe(Effect.provide(FetchHttpClient.layer)),
);
```

Request schemas determine required params, query fields, headers, and payloads. Response schemas determine success values and declared errors. Effect supplies HTTP execution, schema encoding/decoding, cancellation, and composable retry/timeout policies.

## Programmatic generation

```ts
import { Effect } from "effect";
import { openApiToEffectTsCode } from "@alt-stack/effect-openapi";

const source = await Effect.runPromise(
  openApiToEffectTsCode({ document: openapiDocument }),
);
```

The function accepts `unknown` and returns `Effect<string, OpenApiGenerationError>`. It validates the document before emitting source, preserves the caller's input, and fails on upstream generation warnings so dropped or approximated features are visible. For example, non-security cookie parameters and additional operation tags cause a diagnostic rather than silently disappearing.

Documents must contain their references internally. External file/URL references are not loaded; bundle them before generation. Arbitrary Zod transforms and custom codec registries are outside this package's scope. OpenAPI coverage follows the pinned upstream emitter and is not a claim of complete conformance.

Effect and its generator are pinned to `4.0.0-rc.112`. Generated code should use that same Effect version; upgrading requires rerunning the generated-code contract tests.

## Checks

```sh
pnpm --filter @alt-stack/effect-openapi test
pnpm --filter @alt-stack/effect-openapi check-types
pnpm --filter @alt-stack/effect-openapi build
```

Two focused tests compile and execute generated output and check generation failures. The successful fixture checks operation names, required inputs, exact success/error/service types, local component references, request encoding, and response validation through native `HttpApiClient`.
