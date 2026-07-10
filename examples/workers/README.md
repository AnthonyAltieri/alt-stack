# Trigger.dev Workers example

A multi-router `@alt-stack/workers-trigger` application with on-demand tasks, cron schedules, queue-marked procedures, custom context, middleware, error observation, and Trigger.dev caller examples.

## Prerequisites

- Node.js 18+
- pnpm 10
- a Trigger.dev project and credentials accepted by Trigger.dev SDK 3.x

Install the workspace:

```bash
pnpm install
```

This example does not contain a committed Trigger.dev project config. Initialize/configure it for this directory once, following the Trigger.dev CLI prompts:

```bash
cd examples/workers
pnpm exec trigger init
```

Then start the configured development process:

```bash
pnpm --filter workers dev
```

The package script runs `npx trigger dev`. Trigger.dev must be able to discover the exports in `src/trigger/tasks.ts`.

## What is defined

### Email router

- `send-welcome-email`: payload-validated task with a declared output
- `daily-digest`: daily cron procedure
- `process-bulk-email`: queue-marked procedure

### User router

- `sync-user`: payload-validated task
- `cleanup-inactive-users`: weekly cron procedure

### Data pipeline router

- separate import, transform, and export queue-marked procedures
- one on-demand ETL orchestration task
- one daily cleanup cron procedure

The routers share an in-memory `AppContext` defined in `src/context.ts` and are combined by `mergeWorkerRouters` in `src/routers/index.ts`.

## Task exports

`src/trigger/tasks.ts` calls `createWorker(appRouter, options)` and exports individual entries from the returned `tasks` record. Trigger context is available to `createContext`; the example also logs failures through `onError`.

## Caller examples

`src/examples/enqueue-pipeline.ts` exports examples for:

- `tasks.trigger` and `tasks.triggerAndWait`;
- `tasks.batchTrigger` and `tasks.batchTriggerAndWait`;
- idempotency keys and delayed execution; and
- manual and single-task pipeline orchestration.

These functions are demonstrations and are not invoked automatically by `pnpm dev`.

## Current adapter limitations visible in the example

- Trigger's current adapter treats `.queue(name)` like an ordinary task/schemaTask and does not forward the queue name.
- It forwards cron patterns but not `CronConfig.timezone`.
- Returned Altstack `Err` values do not fail a run; throw to invoke `onError` and Trigger.dev failure handling.
- Procedures with `.output(schema)` currently validate the entire Result envelope. The email and data-pipeline output examples therefore expose a known mismatch and may fail after returning `ok(value)`. Remove those `.output(...)` calls to run them under the current adapter, or schema the Result envelope.

These limitations are documented so the example is not mistaken for behavior the adapter does not implement yet.

## Verify

```bash
pnpm --filter workers check-types
```

See the [Workers quickstart](../../apps/docs/docs/workers/quickstart.md) and [Trigger adapter API](../../apps/docs/docs/workers/api/trigger.md).
