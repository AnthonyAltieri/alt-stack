# Hono Todo server example

A runnable Hono application that exercises `@alt-stack/server-hono`: structured input, output validation, tagged errors, reusable auth procedures, nested routers, OpenAPI docs, and Result-returning business logic.

The source of truth is [`src/index.ts`](./src/index.ts); the in-memory database resets whenever the process starts.

## Quickstart

From the repository root, install workspace dependencies and start the example:

```bash
pnpm install
pnpm --filter altstack-server dev
```

The server listens on `http://localhost:3000`. No environment file is required by the current entry point.

```bash
curl 'http://localhost:3000/api/todos?completed=false&limit=10'
curl 'http://localhost:3000/docs/openapi.json'
```

Swagger UI is mounted at `http://localhost:3000/docs` and loads its browser assets from `unpkg.com`.

## Authentication

The demo treats the raw `Authorization` header as a user ID. Two users are seeded:

| Role | Header value |
| --- | --- |
| administrator | `00000000-0000-0000-0000-000000000001` |
| regular user | `00000000-0000-0000-0000-000000000002` |

```bash
curl 'http://localhost:3000/api/users/me' \
  -H 'Authorization: 00000000-0000-0000-0000-000000000002'
```

This is intentionally not a real authentication scheme.

## Routes

| Method and path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/todos` | public | list todos; query supports `completed`, coerced `limit`, and coerced `offset` |
| `POST /api/todos` | user | create a todo from `title` and optional `description` |
| `GET /api/todos/{id}` | public | fetch a todo; returns tagged 404 when absent |
| `PUT /api/todos/{id}` | user | update fields; optional `notify` query value is coerced to boolean |
| `DELETE /api/todos/{id}` | user | delete a todo |
| `PATCH /api/todos/{id}/complete` | user | set `completed` |
| `GET /api/users/me` | user | return the current profile |
| `GET /api/users/{id}` | public | return a public user projection |
| `GET /api/admin/users` | admin | list users, optionally filtered by `role` |
| `DELETE /api/admin/users/{id}` | admin | delete a user and their todos |
| `PUT /api/v2/todos/{id}` | user | return a domain `Result` directly from update logic |
| `DELETE /api/v2/todos/{id}` | user | return a domain `Result` directly from delete logic |
| `GET /api/v2/todos/{id}/details` | public | compose a domain `Result` and calculate `canEdit` |

Example create request:

```bash
curl -X POST 'http://localhost:3000/api/todos' \
  -H 'content-type: application/json' \
  -H 'Authorization: 00000000-0000-0000-0000-000000000002' \
  -d '{"title":"Document the API","description":"Verify every example"}'
```

## Common Patterns demonstrated

- `init<AppContext>()` binds application context to every procedure.
- `createContext(c)` resolves the current user before middleware/handlers run.
- `protectedProcedure` and `adminProcedure` add tagged auth errors while narrowing `ctx.user`.
- Router nesting produces `/todos`, `/users`, `/admin`, and `/v2/todos` prefixes.
- URL params use OpenAPI braces and string-compatible schemas; query numbers/booleans use Zod coercion.
- `TaggedError` schemas map domain tags to 400/401/403/404 status codes.
- `createDocsRouter()` generates the OpenAPI JSON and Swagger UI routes.
- V2 routes show `Result` values flowing from business logic without throw/catch translation.

Runtime tagged errors use `{ error: { code, message, ...properties } }`. Generated OpenAPI currently describes the declared error schema as a flat body, so the two are not exact wire equivalents. See [Server common patterns](../../apps/docs/docs/server/common-patterns.md#error-wire-formats-and-openapi).

## Verify the example

```bash
pnpm --filter altstack-server check-types
pnpm --filter altstack-server build
pnpm --filter altstack-server test:e2e
```

The end-to-end suite calls the Hono app in process. It covers CRUD, authorization, role checks, validation, error envelopes, router composition, and the V2 Result flows.

## Project map

| File | Role |
| --- | --- |
| `src/index.ts` | routers, schemas, errors, context, in-memory data, server bootstrap |
| `src/index.e2e.spec.ts` | in-process HTTP contract tests |
| `src/auth.ts`, `src/store.ts`, `src/env.ts` | additional small example modules; the current server entry point keeps its active demo logic in `index.ts` |
| `generated-types.ts` | preserved generated artifact; it is not imported by the active server and is not the authority for current routes |

## Documentation

- [Server quickstart](../../apps/docs/docs/server/quickstart.md)
- [Server common patterns](../../apps/docs/docs/server/common-patterns.md)
- [Hono API Documentation](../../apps/docs/docs/server/api/hono.md)
