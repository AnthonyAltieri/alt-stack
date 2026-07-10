# Altstack multi-service example

This nested pnpm workspace demonstrates the complete contract flow across two Hono services, generated HTTP SDKs, a Next.js web client, and WarpStream-backed background jobs.

It is an integration reference, not a production starter. Authentication, persistence, and job side effects are intentionally in-memory or illustrative.

## Architecture

| Workspace | Responsibility |
| --- | --- |
| `apps/backend-auth` | signup, login, session validation, Hono server, and OpenAPI generation |
| `apps/backend-logic` | task CRUD, Hono server, and worker-job production; create/update/delete are authenticated, while list/get are deliberately public in this demo |
| `apps/workers` | notification/report job definitions and WarpStream worker runtime |
| `apps/web` | Next.js UI using generated SDK maps through `@alt-stack/http-client-ky` |
| `packages/backend-auth-sdk` | generated Zod schemas plus `Request`/`Response` maps |
| `packages/backend-logic-sdk` | generated Zod schemas plus `Request`/`Response` maps |
| `packages/workers-sdk` | generated AsyncAPI topic/job schemas |

The services own their Zod routers. Generation scripts produce OpenAPI or AsyncAPI documents, and the SDK workspaces turn those documents into client-facing runtime schemas.

## Prerequisites

- Node.js 20.19+ or 22.12+ (required by the nested lint toolchain)
- pnpm 10
- a Kafka-compatible broker reachable by the logic service and worker (WarpStream or local Kafka)

This example has its own `pnpm-workspace.yaml` and lockfile and pins the published Altstack 1.4 package line; it does not automatically link packages from the parent workspace. Run its commands from `examples/real-life`, not the repository root.

## Install

```bash
cd examples/real-life
pnpm install --frozen-lockfile
```

No environment file is required for the local defaults:

- auth service: `http://localhost:3001`;
- logic service: `http://localhost:3002`;
- web app: `http://localhost:3000`;
- broker: `localhost:9092` unless `WARPSTREAM_URL` is exported.

The `tsx` service scripts read the shell environment; they do not automatically load the included `.env.example` files. Export overrides before starting an individual service, for example:

```bash
PORT=3102 \
AUTH_SERVICE_URL=http://localhost:3101 \
WARPSTREAM_URL=broker.example.test:9092 \
pnpm --filter @real-life/backend-logic dev

WARPSTREAM_URL=broker.example.test:9092 \
GROUP_ID=real-life-workers-dev \
pnpm --filter @real-life/workers dev
```

Next.js loads `apps/web/.env.local`; set `NEXT_PUBLIC_AUTH_URL` and `NEXT_PUBLIC_LOGIC_URL` there when the services do not use ports 3001 and 3002.

## Generate contracts

```bash
pnpm generate:all
```

This runs each owning application's document generator before the matching SDK generator, in deterministic auth/logic/worker order. Router modules are import-safe, so generation does not start HTTP listeners or connect the worker. The SDK workspaces declare `tsx` directly because the published 1.4 generator launchers otherwise miss pnpm's virtual-store binary; the generator source in this checkout fixes that launcher path for a later release. Generated SDK files should change whenever the owning router contract changes.

## Run

Start the Kafka-compatible broker first, then run the workspace applications:

```bash
pnpm dev
```

The auth and logic services expose their OpenAPI documents beneath `/docs/openapi.json`. The web application calls both services through generated `Request` and `Response` maps; both services enable CORS for the documented `http://localhost:3000` web origin. Creating or completing a task attempts to enqueue a worker job.

To run one application at a time:

```bash
pnpm --filter @real-life/backend-auth dev
pnpm --filter @real-life/backend-logic dev
pnpm --filter @real-life/workers dev
pnpm --filter @real-life/web dev
```

## Verify

```bash
pnpm build
pnpm lint
```

Live job delivery additionally requires the broker. A successful TypeScript build proves the workspace contracts compile; it does not prove broker connectivity, retry behavior, or external delivery.

The lint command excludes generated SDK source, whose emitted regex literals intentionally preserve source-schema escapes; the build still type-checks every generated module and every consumer.

## Demo-only boundaries

- Users, sessions, and tasks are stored in process memory.
- Password “hashing” is a visible placeholder and must not be used in production.
- The browser stores a demo token in `localStorage`.
- Task list/get routes are public and return unscoped in-memory data; they are not an authorization model.
- HTTP CORS is fixed to `http://localhost:3000`, and the adapters' fallback 500 responses may expose thrown messages/stacks; configure both deliberately for production.
- The logout route is a bodyless POST. The current TypeScript client requires `body: never` for that shape, so the demo contains a localized unsafe cast until that type-level limitation is fixed.
- Generated OpenAPI describes flat declared errors while current server adapters send an `{ error: ... }` envelope; declared error responses can therefore fall into the client's unexpected-response branch.
- Worker bodies log intended side effects rather than sending notifications or creating reports.
- The logic service degrades when its lazy worker client cannot connect, so an HTTP request can succeed without demonstrating job delivery.

For the source-backed production patterns, see [Altstack Together](https://altstack-docs.vercel.app/together/quickstart).
