# Trigger.dev server adapter API Documentation

Package: `@alt-stack/workers-trigger`

The Trigger.dev server adapter turns a `WorkerRouter` into task definitions. It re-exports every `@alt-stack/workers-core` value and type; [Workers core API](./core.md) is therefore also part of this package's public surface.

## `createWorker`

```typescript
function createWorker<TCustomContext extends object>(
  router: WorkerRouter<TCustomContext>,
  options?: CreateWorkerOptions<TCustomContext>,
): WorkerResult
```

The function is synchronous. It iterates over registered procedures, creates one Trigger.dev definition per job name, and returns them in `tasks`.

```typescript
import { createWorker } from "@alt-stack/workers-trigger";
import { jobs } from "./jobs.js";

export const { tasks } = createWorker(jobs, {
  createContext: () => ({ db }),
  onError: (error, ctx) => console.error(ctx.jobName, error),
  telemetry: { enabled: true, serviceName: "email-workers" },
});

export const sendWelcomeEmail = tasks["send-welcome-email"];
```

### Procedure mapping

| Procedure | Trigger.dev definition |
| --- | --- |
| task with payload schema | `schemaTask({ id, schema, run })` |
| task without payload schema | `task({ id, run })` |
| queue | same task/schemaTask choice; `procedure.queue` is not forwarded |
| cron | `schedules.task({ id, cron: pattern, run })` |

Cron defaults to `"0 * * * *"` only if a malformed registered cron procedure lacks its config. `CronConfig.timezone` is not forwarded. Scheduled tasks pass Trigger.dev's scheduled payload to the procedure validation path; avoid attaching an unrelated custom payload schema to a cron procedure.

### Execution order

For each run, the adapter:

1. optionally creates an OpenTelemetry consumer span;
2. builds `TriggerContext` from the Trigger.dev context;
3. validates the payload;
4. calls and awaits `createContext`;
5. runs ordinary middleware in order;
6. calls the procedure handler;
7. parses the entire handler return with the output schema, if configured; and
8. records success or catches, records, calls `onError`, and rethrows a failure.

A returned Altstack `Err` is not inspected and therefore follows the success path. Throw when Trigger.dev must treat a run as failed. Result-based middleware created by `createMiddlewareWithErrors` is not interpreted by the current adapter.

## `CreateWorkerOptions<TCustomContext>`

| Property | Type | Behavior |
| --- | --- | --- |
| `createContext` | `(baseCtx: TriggerContext) => TCustomContext \| Promise<TCustomContext>` | builds per-run application context after input validation |
| `onError` | `(error: Error, ctx: TriggerContext) => void \| Promise<void>` | awaited before the original error is rethrown |
| `telemetry` | `boolean \| WorkerTelemetryConfig` | enables core tracing; metrics are not exposed by this adapter |

`onError` does not run when its own enclosing task definition cannot be constructed. An error thrown by `onError` replaces the original throw.

## `TriggerContext`

Extends `BaseWorkerContext`:

| Property | Source |
| --- | --- |
| `jobId` | `ctx.run.id` |
| `jobName` | router job name |
| `attempt` | `ctx.attempt.number` |
| `span` | optional core-created OpenTelemetry span |
| `trigger` | full Trigger.dev SDK v3 `Context` |

## `WorkerResult`

```typescript
interface WorkerResult {
  tasks: Record<string, unknown>;
}
```

The keys are exact registered job names. Values are intentionally typed as `unknown`; export selected entries for Trigger.dev discovery. There is no adapter `disconnect` method.

## Complete adapter-specific exports

`createWorker`, `TriggerContext`, `CreateWorkerOptions`, and `WorkerResult`, plus every re-export described in [Workers core API](./core.md).
