# http-client: zod validation callback

## Goal
Add an optional callback to `createApiClient` (fetch + ky) that is invoked whenever Zod validation fails for request or response data.

## Success criteria
- `createApiClient` accepts `onValidationError` and forwards it to the core `ApiClient`.
- Callback fires for Zod request validation failures (params/query/body) and response validation failures.
- Callback receives enough context to debug (endpoint, method, request/response, etc.).
- Existing runtime behavior stays the same (request validation throws `ValidationError`; response validation continues returning an `UnexpectedApiClientError` union member).

## Steps
- [x] Locate current Zod validation/throw sites in `http-client-core`
- [x] Design callback type + context shape
- [x] Implement callback invocation for request + response validation failures
- [x] Expose option on `@alt-stack/http-client-fetch` and `@alt-stack/http-client-ky`
- [x] Add/adjust tests (at least in fetch client) to cover both paths
- [x] Run targeted lint + typecheck + tests for touched packages
- [x] Write short review notes + usage example

## Risks / edge cases
- Callback must not affect retry behavior (must not throw / must be guarded)
- Avoid logging or leaking potentially sensitive request/response bodies by default (callback consumer responsibility)

## Verification plan
- Run `pnpm -C packages/http-client-core check-types`
- Run `pnpm -C packages/http-client-fetch test -- run src/client.spec.ts`
- Run `pnpm -C packages/http-client-fetch check-types`
- Run `pnpm -s oxlint` on modified files

## Review notes
- Added `onValidationError` to `ApiClientOptions` and surfaced it through the fetch + ky `createApiClient` wrappers.
- Callback context includes `{ kind, location, endpoint, method, message, data, issues, zodError }` plus response-only `{ status, statusCode, statusText, raw }`.
- Callback is guarded so it can’t affect retries/control-flow if user code throws.

# zod-openapi: simplification + idiomaticity review

## Goal
Produce a thorough review of `packages/zod-openapi` implementation + tests, and identify concrete, high-leverage simplifications that improve readability and idiomatic TypeScript without changing public behavior.

## Success criteria
- Clear map of the package: public API surface, internal layers, and test strategy.
- List of specific simplifications with rationale (what to change, why it’s simpler, what it risks).
- Suggestions favor “simple code over abstraction”, with examples where useful.
- Verification plan to ensure no behavior regressions.

## Assumptions / constraints
- Keep public API and generated OpenAPI output stable unless explicitly called out.
- Prefer local, incremental refactors over rewrites.
- Prefer clarity over cleverness; avoid unnecessary generics / indirection.

## Steps
- [x] Locate entrypoints, exports, and module boundaries for `zod-openapi`
- [x] Read core implementation paths end-to-end (schema conversion, refs, metadata, helpers)
- [x] Review tests: coverage, fixtures, readability, duplication, brittleness
- [x] Identify simplification opportunities (remove layers, inline trivial helpers, reduce generic complexity)
- [x] Propose concrete refactors with file-level guidance and migration notes (if any)
- [x] Run targeted tests/lint relevant to suggested changes (or document how to)
- [x] Write review summary + recommended next actions

## Risks / edge cases to watch
- `$ref`/component naming stability and deterministic ordering
- Zod effects/transforms/refinements and metadata propagation
- Optional/nullable/default handling differences
- Union/intersection flattening and discriminated unions
- Recursive schemas and cycle handling
- OpenAPI version differences (3.0 vs 3.1) if supported

## Verification plan
- Identify the smallest test subset that exercises the refactor area.
- Run package tests for `packages/zod-openapi` (and any golden snapshot tests).
- If outputs are snapshot/golden-file based, confirm diffs are intentional and minimal.
- Run TypeScript build for the package (and any lint step scoped to touched files).

## Review notes (filled as we go)
- **Public surface:** `src/index.ts` exports `openApiToZodTsCode`, `convertSchemaToZodString`, registry helpers, interface generation helpers, and route parsing helpers.
- **Test status:** `pnpm -C packages/zod-openapi test` passes; `pnpm -C packages/zod-openapi check-types` currently fails because some `.spec.ts` intentionally pass `null/undefined/string` where params are typed as `AnySchema`.
- **High-signal simplifications / idiomatic wins**
  - Fix `SUPPORTED_STRING_FORMATS` typing: it’s a runtime array but typed as a union string; downstream code compiles because it accidentally uses `string.includes` typing even though runtime is `Array.includes`.
  - Make `check-types` useful: exclude `src/**/*.spec.ts` from the package `tsconfig.json`, or alternatively widen top-level APIs (`convertSchemaToZodString`, `extractSchemaDependencies`, `schemaToTypeString`) to accept `unknown` and narrow internally.
  - Remove dead state: `SchemaRegistry.nameToFingerprint` is written but never read.
  - Route schema generation (`to-typescript.ts`) is very repetitive for params/query/headers/body/responses; a small helper can remove ~100 lines without abstraction creep.
- Duplicate helpers (`quotePropertyName`, route-name generation, `$ref` parsing) appear in multiple files; consolidating 1–2 of them would reduce drift.
- **Correctness footnote:** `convertOpenAPIIntersectionToZod` emits `z.intersection(a, b, c)` for `allOf` of 3+, but Zod’s `intersection` only takes 2 args; this will type-error in generated TS for those schemas. Should reduce/nest intersections.

## Proposed refactors (ordered, minimal surface area)
1) **Make `check-types` pass**
   - Option A (simplest): exclude tests from the package `tsconfig.json` via `"exclude": ["src/**/*.spec.ts"]` (keep tests type-checked separately if desired).
   - Option B (arguably “truer” API): change public-ish helpers to accept `unknown` (`convertSchemaToZodString`, `extractSchemaDependencies`, `schemaToTypeString`) and narrow internally; then fix tests without `as any`.

2) **Fix + simplify supported string formats**
   - Replace `SUPPORTED_STRING_FORMATS_MAP` + awkward cast with a `const` array `as const`, and derive `type SupportedStringFormat = typeof SUPPORTED_STRING_FORMATS[number]`.
   - Optional: allow registry to accept arbitrary `format: string` (true “custom formats”), keeping built-ins as a documented list only.

3) **Fix `allOf` intersection codegen**
   - Implement nested intersections for 3+ members: `a & b & c` becomes `z.intersection(z.intersection(a, b), c)` (and update `src/types/intersection.spec.ts`).

4) **Simplify `to-typescript.ts` route schema emission**
   - Replace 3 copy/pasted blocks (params/query/headers) with one helper that takes `{ schemaName, params, requiredPolicy }`.
   - Drop `generatedNames` if it’s not guarding a real collision case.
   - Unify route schema name generation by exporting the helper from `src/routes.ts` and using it everywhere.

5) **Remove trivial duplication**
   - Consolidate `quotePropertyName` + `validIdentifierRegex` into one shared helper (used by `types/object.ts`, `to-typescript.ts`, `interface-generator.ts`).
   - Consolidate `$ref` parsing/decoding to one helper (used by `dependencies.ts`, `interface-generator.ts`, `to-zod.ts`).

6) **Test suite cleanup (keep coverage, reduce noise)**
   - Remove redundant `afterEach(clearRegistry)` where `beforeEach` already resets.
   - Consider table-driven tests in `src/types/*.spec.ts` to reduce repeated boilerplate.

# OpenAPI: master test spec fixture

## Goal
Create a shared `openapi.json` fixture that exercises the OpenAPI schema permutations we need to support (starting with `zod-openapi`), and add integration tests that validate conversion **to** Zod and **from** Zod (back to OpenAPI/JSON Schema).

## Success criteria
- A new workspace package provides a stable path to the master `openapi.json` fixture for reuse by other packages.
- `packages/zod-openapi` tests:
  - Load the master spec and generate TS code (`openApiToZodTsCode`) with routes enabled.
  - Convert every supported component schema to Zod, validate fixture examples, and ensure Zod → OpenAPI(JSON Schema) conversion doesn’t throw.
- Fixture includes clear guidance/structure for adding new permutations over time.

## Assumptions / constraints
- Fixture targets OpenAPI `3.0.x` (nullable via `nullable: true`).
- We only assert roundtrip behavior for features currently supported by `zod-openapi` (unsupported permutations can be included but must be explicitly marked/skipped).

## Steps
- [ ] Create `packages/openapi-test-spec` with `openapi.json` fixture
- [ ] Add Zod example vectors in the fixture via `x-` vendor extensions
- [ ] Add `zod-openapi` integration tests that load the fixture and exercise conversions
- [ ] Fix any gaps uncovered by the fixture (e.g., invalid Zod codegen)
- [ ] Run targeted lint + tests + typecheck for touched packages
- [ ] Add short README notes for how to extend the fixture

## Risks / edge cases
- Circular `$ref` graphs can’t be evaluated without `z.lazy`; include them as a non-evaluated “string-only” test until supported.
- Some OpenAPI constructs have multiple equivalent JSON Schema encodings; tests should avoid brittle strict-equality comparisons.

## Verification plan
- Run `pnpm -C packages/zod-openapi test`
- Run `pnpm -C packages/zod-openapi check-types`
- Run `pnpm -s oxlint packages/zod-openapi/src`

## Review notes
- Added `packages/openapi-test-spec/openapi.json` as the cross-package “master” OpenAPI 3.0 fixture with `x-altstack-examples` vectors.
- Added `packages/zod-openapi/src/master-openapi.spec.ts` to validate OpenAPI → Zod conversion (including routes) and Zod → OpenAPI(JSON Schema) roundtrip.
- Fixed `allOf` codegen for 3+ members by nesting `z.intersection(...)` calls.
- Updated `packages/zod-openapi/tsconfig.json` to exclude `src/**/*.spec.ts` so `check-types` validates library source (not test inputs).

# server-nestjs: NestJS adapter (Express-first) w/ `ctx.nest.get()`

## Goal
Add `@alt-stack/server-nestjs` so Alt Stack routers can run inside a NestJS app, while route handlers can fetch Nest providers via `ctx.nest.get(Token)` / `ctx.nest.resolve(Token)` (request-scoped safe). Design must keep a clean migration path to non-Nest runtimes (Bun/Fastify/etc.) by treating `ctx.nest` as a small, portable “service locator” contract.

## Success criteria
- In Alt Stack handlers, this works:
  - `const svc = ctx.nest.get(UsersService)` (singleton/transient)
  - `const svc = await ctx.nest.resolve(UsersService)` (request-scoped)
- Provide both integration styles:
  - `registerAltStack(app, config, options)` for `main.ts` (best for ordering)
  - `AltStackModule.forRoot(...)` / `forRootAsync(...)` for AppModule usage
- Express-only MVP (Nest platform-express). Fastify Nest apps fail fast with a clear error.
- Optional docs mounting using existing `@alt-stack/server-express.createDocsRouter`.
- Runtime request/validation/error handling stays in one place by composing `@alt-stack/server-express.createServer`.
- Documentation includes a “migration recipe” for Bun/Fastify: implement the same `ctx.nest` contract with another container.

## Assumptions / constraints
- MVP targets NestJS on **Express** (`@nestjs/platform-express`) only.
- Alt Stack endpoints are mounted at the underlying Express layer, so they do **not** automatically participate in Nest guards/pipes/interceptors/filters.
- Nest DI integration is via `ctx.nest.*` (service locator), not via Nest controllers.
- Keep public API aligned with existing adapters (`server-hono`, `server-express`) where possible.

## Public API (proposed)
- Re-export “server-core surface” (via `@alt-stack/server-express`) for parity: `ok/err`, middleware utils, OpenAPI, etc.
- Provide Nest-typed defaults:
  - `export type NestServiceLocator = { get<T = unknown>(token: any): T; resolve<T = unknown>(token: any): Promise<T> }`
  - `export interface NestBaseContext extends ExpressBaseContext { nest: NestServiceLocator }`
  - `export function init<TCustom extends object = Record<string, never>>(...)` defaults context to `NestBaseContext & TCustom`
  - `export class Router<TContext extends NestBaseContext = NestBaseContext> ...` + `router/createRouter/mergeRouters`
- Integration entrypoints:
  - `registerAltStack(app: INestApplication, config, options)`
  - `AltStackModule.forRoot({ config, ...options })`
  - `AltStackModule.forRootAsync({ useFactory, inject, imports })`

## Runtime design
- **Mounting model:** build an Alt Stack Express sub-app via `@alt-stack/server-express.createServer(...)` and mount it onto Nest’s Express instance:
  - `express.use(mountPath, altStackApp)`
  - optionally: `express.use(join(mountPath, docs.path), docsRouter)`
- **Context injection:** wrap `createServer(..., { createContext })` so every request gets:
  - `nest: { get, resolve }` backed by Nest `ModuleRef` + `ContextIdFactory.getByRequest(req)`
  - merged with any user-supplied `createContext(req, res)` data
- **Request-scoped correctness:** `ctx.nest.resolve()` must:
  - derive `contextId` from the Express `req`
  - register request for the context id (when API is available)
  - call `moduleRef.resolve(token, contextId, { strict: false })`

## File layout (package)
- `packages/server-nestjs/src/index.ts` exports + typed wrappers (match other server-* packages)
- `packages/server-nestjs/src/types.ts` defines `NestServiceLocator`, `NestBaseContext`
- `packages/server-nestjs/src/register.ts` implements `registerAltStack(...)` + helpers (`normalizePath`, `joinPaths`, “express platform check”)

# zod-openapi: master OpenAPI fixture roundtrip (string match)

## Goal
Create a shared “master” `openapi.json` fixture that exercises required OpenAPI permutations (including nested discriminated unions), and add a simple integration test that roundtrips:
- OpenAPI → generated Zod TypeScript (string match)
- Generated Zod → regenerated OpenAPI JSON (string match; examples excluded)

## Success criteria
- Fixture lives in a shared package (so other language libs can reuse it).
- `packages/zod-openapi/src/master-openapi.spec.ts` compares full generated Zod TS output via string match (with whitespace normalization).
- Same test regenerates OpenAPI JSON from the generated Zod module and compares full JSON output via string match (with whitespace normalization).
- No snapshot files required; expected strings are embedded and human-readable in the test.
- `pnpm -C packages/zod-openapi test` passes.

## Assumptions / constraints
- OpenAPI replica should match the fixture **minus** `x-altstack-examples`.
- String comparisons should be resilient to line endings / trailing whitespace.

## Steps
- [x] Capture the current generated Zod TS output for the fixture
- [x] Capture the current regenerated OpenAPI JSON output (minus examples)
- [x] Replace snapshot + deep-equality assertions with full-string comparisons
- [x] Remove snapshot artifacts from the repo
- [x] Run targeted lint + tests + typecheck for `packages/zod-openapi`
- [ ] Commit + push to update the existing PR

## Risks / edge cases
- Output stability: small codegen changes will require updating long expected strings.
- JSON key ordering: prefer deterministic serialization to avoid brittle diffs.

## Verification plan
- Run `pnpm -C packages/zod-openapi test`
- Run `pnpm -s oxlint packages/zod-openapi/src/master-openapi.spec.ts`
- Run `pnpm -C packages/zod-openapi check-types`

## Review notes
- Fixture: `packages/openapi-test-spec/openapi.json` includes nested discriminated unions (`Event` → `PetAdoptedEvent` → `Pet`).
- Test: `packages/zod-openapi/src/master-openapi.spec.ts` now does full-string matches for:
  - OpenAPI → generated Zod TS
  - Generated Zod → regenerated OpenAPI JSON (key-sorted; examples excluded)
- `packages/server-nestjs/src/module.ts` implements `AltStackModule` + internal provider(s)
- `packages/server-nestjs/src/registrar.ts` (or inline) mounts using `HttpAdapterHost` + injected options
- `packages/server-nestjs/src/*.spec.ts` integration tests (Nest TestingModule + supertest)

## Detailed steps
- [ ] Package skeleton
  - [ ] Add `packages/server-nestjs/package.json` (peer deps: `@nestjs/common`, `@nestjs/core`, `express`, `zod`; dep: `@alt-stack/server-express`)
  - [ ] Add `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`
- [ ] Core types + exports
  - [ ] `NestServiceLocator` + `NestBaseContext`
  - [ ] Wrap `init()` so `init()` defaults to `NestBaseContext` (matching the desired DX)
  - [ ] Provide pre-typed `Router` + `router/createRouter/mergeRouters`
- [ ] `registerAltStack(...)` (bootstrap helper)
  - [ ] Resolve Nest Express instance from `app.getHttpAdapter().getInstance()`
  - [ ] Fail fast if adapter instance lacks `.use` (Fastify platform)
  - [ ] Get `ModuleRef` from app container
  - [ ] Create `createNestLocator(req)` that implements `get/resolve`
  - [ ] Create Alt Stack Express sub-app via `createServer(config, { createContext: ... })`
  - [ ] Mount at `mountPath` (default `/`)
  - [ ] If enabled, mount docs router at `docs.path` (default `/docs`) and serve `openapi.json`
- [ ] `AltStackModule` (DI integration)
  - [ ] Define an options injection token (e.g. `ALTSTACK_NEST_OPTIONS`)
  - [ ] Implement `forRoot` and `forRootAsync` (support `inject` + `imports`)
  - [ ] Registrar provider mounts during app init via `HttpAdapterHost` + `ModuleRef`
- [ ] Tests
  - [ ] Happy path: handler calls `ctx.nest.get(UsersService)` and returns value
  - [ ] Validation error: invalid query/body returns `400` (behavior parity with Express adapter)
  - [ ] `resolve()` path: request-scoped provider works (or at least does not throw) when handler uses `await ctx.nest.resolve(...)`
  - [ ] Docs: `GET /<mountPath>/<docsPath>/<openapiPath>` returns JSON spec
- [ ] Docs + migration guide
  - [ ] `packages/server-nestjs/README.md` shows:
    - main.ts `registerAltStack` usage
    - AppModule `forRootAsync` usage
    - handler example using `ctx.nest.get/resolve`
    - migration snippet: Bun/Fastify supply `{ nest: { get, resolve } }` from another container
  - [ ] Update root `README.md` packages list
- [ ] Verification
  - [ ] `pnpm -C packages/server-nestjs build`
  - [ ] `pnpm -C packages/server-nestjs check-types`
  - [ ] `pnpm -C packages/server-nestjs test`
  - [ ] `pnpm -s oxlint` on touched files

## Migration story (Nest ➜ Bun/Fastify)
- Route code depends on `ctx.nest.get/resolve` only (service locator contract).
- In non-Nest runtimes, implement the same contract in `createContext()` using your container of choice.
- Optional follow-up: introduce a project-level `ctx.services` facade to gradually remove “service locator” calls from handlers if desired.

## Risks / edge cases
- **Prefix confusion:** `mountPath` + Alt Stack config prefixes can double-prefix routes; docs must show recommended patterns.
- **Request-scoped pitfalls:** incorrect `ContextIdFactory` usage yields wrong lifetimes; `resolve()` must be request-aware.
- **Ordering/collisions:** Module-based mounting can be surprising when paths overlap with controllers; recommend `registerAltStack()` for explicit control.
- **Global prefix:** Nest’s `setGlobalPrefix()` won’t apply to mounted middleware; users should include it in `mountPath`.
- Is “outside Nest pipeline” acceptable, or do you need guards/pipes/interceptors to apply to these endpoints?

# server-nestjs: Nest middleware adapter (Alt Stack middleware)

## Goal
Allow authoring NestJS (Express) middleware using Alt Stack middleware builders, and have context overrides flow into Alt Stack route handlers via `ctx`.

## Success criteria
- Provide `createNestMiddleware(app, middleware)` (exported by `@alt-stack/server-nestjs`) returning an Express/Nest-compatible `(req, res, next)` middleware.
- Middleware can access Nest DI via `ctx.nest.get/resolve` and Express via `ctx.express.req/res`.
- Middleware can extend context via `next({ ctx: { ... } })` and those fields appear in Alt Stack handlers on the same request.
- Result-based middleware (`createMiddlewareWithErrors().errors(...).fn(...)`) can return typed errors and have them mapped to HTTP status codes in the Nest middleware layer.
- Add non-networked unit tests and update `packages/server-nestjs/README.md` with a minimal example.

## Assumptions / constraints
- Nest integration remains **Express platform only** for now.
- No port-binding tests (sandbox restrictions); use request/response stubs and mocks.

## Steps
- [ ] Add a request-scoped “context bag” on `req` (symbol key) with helpers to read/merge.
- [ ] Update `registerAltStack()` to merge the request bag into `createContext()` output (bag overrides user `createContext`, but `nest` always wins).
- [ ] Implement `createNestMiddleware()` that:
  - Builds a minimal ctx `{ ...bag, nest, express, input, span?: undefined }`
  - Runs an Alt Stack middleware chain (single fn, builder, or builder-with-errors)
  - On `next({ ctx })`, merges ctx into the request bag
  - On error, responds with `{ error: { code, message, ...props } }` using status derived from schemas (or 500)
- [ ] Add unit tests covering:
  - `createNestMiddleware` success path calls `next()` and writes to bag
  - `createNestMiddleware` error path returns correct HTTP status via schemas
  - `registerAltStack` merges bag into ctx for handlers
- [ ] Update docs with a small “Nest middleware” example.
- [ ] Run targeted lint/typecheck/tests for changed files.

## Risks / edge cases
- Ensure `next()` is not called if `res` is already ended/sent.
- Ensure multiple Nest middlewares can compose by reading/writing the same request bag.
- Express 4 vs 5 promise handling: middleware must catch and `next(err)` / respond explicitly.

## Verification plan
- `pnpm -C packages/server-nestjs test`
- `pnpm -C packages/server-nestjs check-types`
- `pnpm exec oxlint` on touched `packages/server-nestjs/src/*.ts`

# server-nestjs: E2E test for Nest (Express) + Alt Stack

## Goal
Create an end-to-end test that boots a small but realistic NestJS (Express) app, mounts Alt Stack routes via `@alt-stack/server-nestjs`, and validates key behaviors that replace controller-based endpoints.

## Success criteria
- E2E test runs fully in-process (no TCP listen) and exercises:
  - Nest DI usage in handlers (`ctx.nest.get` / `ctx.nest.resolve`)
  - Request-scoped provider resolution
  - Zod input validation (params/query/body)
  - Result-based error mapping (typed errors)
  - Middleware integration (Alt Stack middleware in Nest)
- Test is deterministic, fast, and isolated.
- Verification includes a focused test run for the new E2E file and lint for touched files.

## Assumptions / constraints
- Must use Express platform (no Fastify in this test).
- Sandbox forbids `listen()`; requests are dispatched via `http.IncomingMessage`/`ServerResponse`.
- Avoid adding new heavyweight dependencies unless strictly needed.

## Steps
- [x] Decide E2E test location + framework (likely `packages/server-nestjs/src/e2e.spec.ts`)
- [x] Sketch minimal Nest module graph (services + request-scoped provider + module)
- [x] Build Alt Stack router covering usecases (params/query/body, errors, middleware, DI)
- [x] Wire Nest app using `registerAltStack`
- [x] Implement request dispatcher to simulate requests without listening
- [x] Assert responses + side effects (ctx override, errors, validation)
- [x] Run focused lint + test for the new file

## Risks / edge cases
- Request-scoped DI resolution without Nest `ContextIdFactory` (ensure `resolve` is used).
- Express mount path affecting routes.

## Verification plan
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`

## Review notes
- Updated the in-process dispatcher to emit body data after async Nest middleware runs (avoids lost body events).
- Ensured the dispatcher uses the Express `handle` fallback and captures response chunks reliably.
- Split query vs body validation into separate tests for clearer failure signals.

## Verification results
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`

# server-* adapters: consume shared isResult

## Goal
Stop defining `isResult` separately in each server adapter package and import the shared guard instead.

## Success criteria
- `isResult` is re-exported from `@alt-stack/server-core`.
- `server-express`, `server-bun`, `server-hono`, and `server-nestjs` remove local `isResult` helpers.
- Adapters import and use the shared `isResult` from `@alt-stack/server-core`.

## Steps
- [x] Re-export `isResult` from `packages/server-core/src/index.ts`.
- [x] Replace local guards in adapter packages with imports from `@alt-stack/server-core`.
- [x] Run targeted lint on touched adapter files.
- [x] Run focused tests/checks for changed packages.
- [x] Add review notes + verification results.

## Risks / edge cases
- Workspace package tests that bind sockets can fail in sandbox (`EPERM`/`EADDRINUSE`) independent of code correctness.
- `server-core` dts build must run after `result` build so export typings are fresh.

## Verification plan
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-core/src/index.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-express/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-bun/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-hono/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-nestjs/src/middleware.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/result build`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-core build`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-hono test -- run src/server.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-nestjs test -- run src/middleware.spec.ts src/e2e.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-express test -- run src/types.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-bun test -- run src/types.spec.ts`

## Review notes
- Centralized `isResult` in `@alt-stack/result` and consumed it through `@alt-stack/server-core` to avoid guard drift.
- Removed duplicated guard logic from adapter implementations.
- Kept one `Result` type import in `server-nestjs` middleware where it is still used as a return annotation.

## Verification results
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-core/src/index.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-express/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-bun/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-hono/src/server.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/server-nestjs/src/middleware.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/result test -- run src/result.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/result build`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-core build`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-hono test -- run src/server.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-nestjs test -- run src/middleware.spec.ts src/e2e.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-express test -- run src/types.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-bun test -- run src/types.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-express test -- run src/server.spec.ts` fails in sandbox due `supertest` attempting to bind `0.0.0.0` (`EPERM`).
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/server-bun test -- run src/server.spec.ts` fails in sandbox due Bun listen failure (`EADDRINUSE` on `port: 0`).

# result: add isResult guard

## Goal
Add `isResult` type guard to `@alt-stack/result` and expose it from the public API.

## Success criteria
- `isResult(value)` returns `true` for valid `Ok`/`Err` and `false` otherwise.
- Guard narrows to `Result<unknown, ResultError>`.
- Exported from `@alt-stack/result` index.
- Tests cover Ok, Err, and invalid shapes.

## Steps
- [x] Add `isResult` to `packages/result/src/guards.ts`.
- [x] Export `isResult` from `packages/result/src/index.ts`.
- [x] Add tests in `packages/result/src/result.spec.ts`.
- [x] Run targeted lint for touched files.
- [x] Run focused tests for result package.
- [x] Update review notes + verification results.

## Risks / edge cases
- Ensure Err branch validates `ResultError` shape.
- Avoid false positives for `{ _tag: "Ok" }` without `value`.

## Verification plan
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/guards.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/index.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/result.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/result test -- run src/result.spec.ts`

## Review notes
- Added `isResult` guard that validates Ok/Err shape and enforces `ResultError` on Err.
- Exported `isResult` from the public index and added guard tests.

## Verification results
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/guards.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/index.ts`
- `pnpm exec oxlint /Users/anthonyaltieri/code/alt-stack/packages/result/src/result.spec.ts`
- `pnpm -C /Users/anthonyaltieri/code/alt-stack/packages/result test -- run src/result.spec.ts`

## Review notes
- Added a single in-process E2E spec that boots a Nest (Express) app, mounts Alt Stack routes, and validates DI, request-scoped providers, validation, errors, and middleware.
- Added a tiny Reflect metadata shim for tests so the suite can skip cleanly if Nest deps are missing.

## Verification results
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`

# server-nestjs: E2E Nest+Express harness fix

## Goal
Make the NestJS + Express E2E test run reliably (no timeouts) while preserving coverage of Alt Stack middleware, DI, validation, and error mapping.

## Success criteria
- `packages/server-nestjs/src/e2e.spec.ts` passes without timeouts.
- Coverage still includes:
  - `ctx.nest.get` and `ctx.nest.resolve`
  - request-scoped provider behavior
  - middleware ctx propagation
  - Zod validation and typed error mapping
- No skipped tests; dependencies installed locally.

## Assumptions / constraints
- Express platform only (no Fastify).
- Prefer an in-process request harness; `supertest` is acceptable if it stays local.
- Avoid adding new deps unless needed (supertest is already present).

## Steps
- [x] Review the current E2E request dispatch and identify the hang.
- [x] Replace/adjust the request harness to be reliable.
- [x] Update the spec to keep all assertions intact.
- [x] Run targeted lint on touched files.
- [x] Run the E2E test; fix and re-run until green.
- [x] Add review notes + verification results.

## Risks / edge cases
- `supertest` may bind a local ephemeral port; if blocked, fall back to an in-process dispatch.
- Request-scoped providers rely on Nest context; ensure `resolve` stays per-request.

## Verification plan
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`

## Review notes
- Updated the in-process dispatcher to emit body data after async Nest middleware runs (avoids lost body events).
- Ensured the dispatcher uses the Express `handle` fallback and captures response chunks reliably.
- Split query vs body validation into separate tests for clearer failure signals.

## Verification results
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`

# Commit + PR metadata refresh (2026-02-10)

## Goal
Commit and push the current branch changes, then re-evaluate the open PR title/body and update if they no longer match the branch scope.

## Success criteria
- New commit created on `codex/server-nestjs` with current working tree changes.
- Branch pushed to `origin/codex/server-nestjs`.
- Active PR title/body reviewed and updated only if needed.
- Review notes and verification results captured.

## Assumptions / constraints
- Existing untracked `tasks/` and `.codex/` files are intended to be committed with this branch.
- Use non-interactive git/GitHub CLI commands.

## Steps
- [ ] Add plan entry and track progress in `tasks/todo.md`.
- [ ] Review working tree delta and stage intended files.
- [ ] Create a single commit with a message reflecting the changes.
- [ ] Push branch to origin.
- [ ] Review current PR title/body and edit if mismatch is found.
- [ ] Add review notes + verification results.

## Risks / edge cases
- PR body might reference outdated scope from earlier commits.
- Untracked files could include local-only state; verify before staging.

## Verification plan
- `git status --short`
- `git diff --stat --cached`
- `git push`
- `gh pr view --json number,title,body,url,headRefName,baseRefName`
- `gh pr edit` (only if metadata changes are needed)

# PR idiomatic/simplicity pass (2026-02-10)

## Goal
Confirm this PR is idiomatic and minimal, and simplify any obvious duplication without changing behavior.

## Success criteria
- Runtime behavior and tests remain green.
- Obvious duplication removed.
- Public adapter exports stay consistent for newly added result guards.

## Assumptions / constraints
- Keep changes scoped to the PR’s touched server/result adapter surface.
- Prefer minimal refactors over structural rewrites.

## Steps
- [x] Review changed runtime/test files for complexity and behavior risks.
- [x] Extract duplicated Nest service locator helper used by register + middleware.
- [x] Ensure adapter `index.ts` re-exports include `isResult` for API parity.
- [x] Run targeted lint and focused tests for touched files.
- [x] Document review findings/results.

## Risks / edge cases
- Refactor could accidentally alter DI `strict: false` fallback behavior.
- Export changes could surface type issues in adapter package entrypoints.

## Verification plan
- `pnpm exec oxlint packages/server-nestjs/src/register.ts`
- `pnpm exec oxlint packages/server-nestjs/src/middleware.ts`
- `pnpm exec oxlint packages/server-nestjs/src/nest-locator.ts`
- `pnpm exec oxlint packages/server-express/src/index.ts packages/server-hono/src/index.ts packages/server-bun/src/index.ts packages/server-nestjs/src/index.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/register.spec.ts src/middleware.spec.ts src/telemetry.spec.ts src/e2e.spec.ts`

## Review notes
- No high-severity correctness issues found in the reviewed PR runtime paths.
- Simplified duplicate DI helper logic by extracting `createNestLocator` into `packages/server-nestjs/src/nest-locator.ts`.
- Kept adapter API surface consistent by re-exporting `isResult` from adapter entrypoints.

## Verification results
- `pnpm exec oxlint packages/server-nestjs/src/register.ts`
- `pnpm exec oxlint packages/server-nestjs/src/middleware.ts`
- `pnpm exec oxlint packages/server-nestjs/src/nest-locator.ts`
- `pnpm exec oxlint packages/server-express/src/index.ts`
- `pnpm exec oxlint packages/server-hono/src/index.ts`
- `pnpm exec oxlint packages/server-bun/src/index.ts`
- `pnpm exec oxlint packages/server-nestjs/src/index.ts`
- `pnpm -C packages/result test -- run src/result.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/register.spec.ts src/middleware.spec.ts src/telemetry.spec.ts src/e2e.spec.ts`
- `pnpm -C packages/server-express check-types` (fails on existing `src/server.telemetry.spec.ts` strict-null issues)
- `pnpm -C packages/server-hono check-types` (fails on existing `src/server.telemetry.spec.ts` strict-null issues)
- `pnpm -C packages/server-bun check-types` (passes)
- `pnpm -C packages/server-nestjs check-types` (fails on existing test typing issues in `src/e2e.spec.ts`)

# Fix package typecheck failures (2026-02-10)

## Goal
Resolve current TypeScript `typecheck` failures in `server-express`, `server-hono`, and `server-nestjs` without changing runtime behavior, and rename scripts from `check-types` to `typecheck`.

## Success criteria
- `pnpm -C packages/server-express typecheck` passes.
- `pnpm -C packages/server-hono typecheck` passes.
- `pnpm -C packages/server-nestjs typecheck` passes.
- Root `pnpm typecheck` pipeline is updated to use `typecheck` tasks.

## Assumptions / constraints
- Keep fixes scoped to type-level test issues.
- Prefer minimal, idiomatic assertions and explicit generics.

## Steps
- [x] Fix strict-null span/event indexing in `server-express` telemetry spec.
- [x] Fix strict-null span/event indexing in `server-hono` telemetry spec.
- [x] Fix `server-nestjs` E2E typing (`ctx.nest.get/resolve`, router context generic).
- [x] Run targeted lint on each touched file.
- [x] Run package `typecheck` for all three packages.
- [x] Record verification results.

## Risks / edge cases
- Overusing non-null assertions can hide real issues; keep assertions paired with length/defined checks.
- Nest router generic fix must preserve middleware-injected `user` context typing.

## Verification plan
- `pnpm exec oxlint packages/server-express/src/server.telemetry.spec.ts`
- `pnpm exec oxlint packages/server-hono/src/server.telemetry.spec.ts`
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `pnpm -C packages/server-express typecheck`
- `pnpm -C packages/server-hono typecheck`
- `pnpm -C packages/server-nestjs typecheck`
- `pnpm -C packages/server-bun typecheck`

## Review notes
- Replaced unsafe index access patterns in telemetry specs with explicit non-null assertions after cardinality checks.
- Added explicit Nest DI generics in E2E (`ctx.nest.get<T>`, `ctx.nest.resolve<T>`) and aligned router/register context generics.
- Renamed script/pipeline task name from `check-types` to `typecheck` across root/package scripts and turbo config.
- Fixed additional strict-null indexing in `packages/server-core/src/telemetry.integration.spec.ts` discovered when running filtered root `pnpm typecheck`.

## Verification results
- `pnpm exec oxlint packages/server-express/src/server.telemetry.spec.ts`
- `pnpm exec oxlint packages/server-hono/src/server.telemetry.spec.ts`
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `pnpm exec oxlint packages/server-core/src/telemetry.integration.spec.ts`
- `pnpm -C packages/server-express typecheck`
- `pnpm -C packages/server-hono typecheck`
- `pnpm -C packages/server-nestjs typecheck`
- `pnpm -C packages/server-core typecheck`
- `pnpm typecheck --filter=@alt-stack/server-express --filter=@alt-stack/server-hono --filter=@alt-stack/server-nestjs`

# Address PR review findings (2026-02-10)

## Goal
Fix the two review blockers: missing tracked Nest locator module and Result-shape payload ambiguity in adapters.

## Success criteria
- `packages/server-nestjs/src/nest-locator.ts` is present in tracked sources.
- Plain payloads shaped like `{ _tag: "Ok", value: ... }` are not treated as framework `Result` values.
- Existing `ok()/err()` returns continue to work across adapters.

## Assumptions / constraints
- Keep behavior stable for typed `Result` via `ok/err` constructors.
- Minimize surface area by fixing discrimination in `@alt-stack/result` once.

## Steps
- [x] Add runtime result branding in `@alt-stack/result` constructors.
- [x] Update `isResult` guard to require branded values.
- [x] Add regression tests for unbranded Result-shaped objects.
- [x] Add adapter-level regression test for raw `_tag` payload behavior.
- [x] Run targeted lint and focused tests/typecheck.
- [x] Document results.

## Risks / edge cases
- Manual hand-crafted Result-like objects will no longer be accepted by `isResult`.
- Ensure non-enumerable brand does not leak into JSON responses.

## Verification plan
- `pnpm exec oxlint packages/result/src/constructors.ts packages/result/src/guards.ts packages/result/src/result.spec.ts`
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `pnpm -C packages/result test -- run src/result.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`
- `pnpm -C packages/server-express typecheck`
- `pnpm -C packages/server-hono typecheck`
- `pnpm -C packages/server-nestjs typecheck`

## Review notes
- Added non-enumerable runtime branding for `ok()/err()` values and changed `isResult` to only accept branded objects.
- Updated adapter middleware result parsing in Express/Hono/Bun to use the unified `isResult` guard instead of raw structural `_tag` checks.
- Added regression coverage to ensure unbranded Result-shaped objects are rejected by `isResult` and treated as plain handler payloads.
- Kept `packages/server-nestjs/src/nest-locator.ts` in the tracked change set to resolve the missing-module review finding.

## Verification results
- `pnpm exec oxlint packages/result/src/marker.ts`
- `pnpm exec oxlint packages/result/src/constructors.ts`
- `pnpm exec oxlint packages/result/src/guards.ts`
- `pnpm exec oxlint packages/result/src/result.spec.ts`
- `pnpm exec oxlint packages/server-bun/src/server.ts`
- `pnpm exec oxlint packages/server-hono/src/server.ts`
- `pnpm exec oxlint packages/server-express/src/server.ts`
- `pnpm exec oxlint packages/server-nestjs/src/e2e.spec.ts`
- `pnpm -C packages/result test -- run src/result.spec.ts`
- `cd packages/server-nestjs && ../node_modules/.bin/vitest --run src/e2e.spec.ts`
- `pnpm -C packages/result typecheck`
- `pnpm -C packages/server-express typecheck`
- `pnpm -C packages/server-hono typecheck`
- `pnpm -C packages/server-nestjs typecheck`
