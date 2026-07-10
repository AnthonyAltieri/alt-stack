# NestJS controllers-to-Altstack example

One task domain implemented three ways on NestJS 11 and Express:

1. conventional Nest controllers, decorator DTOs, `ValidationPipe`, and an exception filter;
2. Altstack routes with Zod boundaries over the same throw-based services;
3. Altstack routes over a Result-returning workflow service.

All variants expose the same paths beneath `/v1/api/tasks`. The example is a migration comparison, not three services that must run together.

## Quickstart

From the repository root, install dependencies and start one variant:

```bash
pnpm install
pnpm --filter nestjs-controllers dev:controllers
```

| Command | Default port | Implementation |
| --- | --- | --- |
| `pnpm --filter nestjs-controllers dev:controllers` | 3001 | `src/controller-app.ts` |
| `pnpm --filter nestjs-controllers dev:altstack` | 3002 | `src/alt-stack-app.ts` |
| `pnpm --filter nestjs-controllers dev:altstack:result` | 3003 | `src/alt-stack-result-app.ts` |

Each command compiles to `dist` before starting. Override the port with `PORT`.

```bash
curl 'http://localhost:3001/v1/api/tasks?status=todo&assigneeId=u-bob&limit=1'
```

## Routes

| Method and path | Auth | Behavior |
| --- | --- | --- |
| `GET /v1/api/tasks` | public | filter by optional `status`, `assigneeId`, and coerced `limit` |
| `POST /v1/api/tasks` | `x-user-id` | create a task owned by the caller |
| `GET /v1/api/tasks/{id}` | public | fetch a task or return 404 |
| `PATCH /v1/api/tasks/{id}` | `x-user-id` | update fields and enforce assignment/status rules |
| `POST /v1/api/tasks/{id}/assign` | `x-user-id` | assign a known user when the caller is owner/admin |

Seeded users are `u-admin`, `u-alice`, `u-bob`, and `u-chris`.

```bash
curl -X POST 'http://localhost:3002/v1/api/tasks' \
  -H 'content-type: application/json' \
  -H 'x-user-id: u-alice' \
  -d '{"title":"Ship docs","priority":"high"}'
```

The domain maps missing/unknown actors to 401, missing tasks/users to 404, policy failures to 403, invalid status transitions to 409, and boundary validation failures to 400.

## What to compare

| Concern | Controller | Altstack + throw services | Altstack + Result services |
| --- | --- | --- | --- |
| Boundary schema | decorated DTO classes | Zod schemas in `schemas.ts` | same Zod schemas |
| Route shape | controller decorators | `router()` + procedures | same procedures |
| Auth context | header lookup inside controller methods | reusable procedure middleware narrows `ctx.actor` | same middleware, backed by Result services |
| Provider access | constructor injection | `ctx.nest.get(Token)` | `ctx.nest.get(Token)` |
| Expected failures | thrown tagged errors translated by a Nest exception filter | small `try/catch` translates declared tagged errors to `err()` | workflow methods return `Result` directly |
| Unexpected failures | Nest default/error filter | one `init({ default500Error })` handler | same default handler |

The throw-based Altstack app demonstrates an incremental migration: existing DTO-shaped services stay intact while the HTTP boundary moves to Zod/procedures. The Result variant then moves expected failure composition into `services-result.ts`, allowing handlers to return workflow results directly.

## Common Patterns demonstrated

- `app.setGlobalPrefix("v1")` runs before `registerAltStack()`.
- `registerAltStack(..., { mountPath: "/api" })` respects the global prefix and mounts at `/v1/api`.
- Nest's `init<TCustomContext>()` wrapper adds `NestBaseContext`; handlers resolve providers with `ctx.nest.get()`.
- Tagged error schemas sit beside route input/output schemas.
- `factory.defaultErrorHandlers` is passed explicitly to registration so the custom 500 payload is active.
- Multi-service assignment coordinates user lookup, task lookup, policy, persistence, and activity recording.

The registered apps inherit Express adapter behavior. Runtime declared errors are wrapped under `error`, while generated OpenAPI error schemas are currently flat. See [Server common patterns](../../apps/docs/docs/server/common-patterns.md#error-wire-formats-and-openapi).

## Verify all three variants

```bash
pnpm --filter nestjs-controllers check-types
pnpm --filter nestjs-controllers build
pnpm --filter nestjs-controllers test:e2e
```

The end-to-end suite creates all three apps from compiled output and compares filtering, validation, missing resources, assignment, authorization, state transitions, and Altstack tagged error payloads.

## Project map

| File | Role |
| --- | --- |
| `src/controller-app.ts` | controller/DTO boundary, ValidationPipe, error filter |
| `src/alt-stack-app.ts` | Zod/procedure boundary over throw-based services |
| `src/alt-stack-result-app.ts` | Zod/procedure boundary over Result workflow services |
| `src/dtos.ts` | controller DTOs and shared domain types |
| `src/schemas.ts` | Zod input/output/error schemas for both Altstack variants |
| `src/services.ts` | throw-based providers and seeded in-memory domain |
| `src/services-result.ts` | Result-returning providers/workflow |
| `src/e2e.spec.ts` | behavioral comparison across compiled variants |

## Documentation

- [Server quickstart](../../apps/docs/docs/server/quickstart.md)
- [Server common patterns](../../apps/docs/docs/server/common-patterns.md)
- [NestJS API Documentation](../../apps/docs/docs/server/api/nestjs.md)
