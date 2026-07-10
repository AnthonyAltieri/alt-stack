# Workers quickstart

Altstack Workers defines typed **jobs**: named units of work with Zod payloads, middleware, and application context. A server adapter materializes the router as Trigger.dev tasks or a WarpStream/Kafka consumer. This differs from the [Kafka family](../kafka/quickstart.md), where procedures react to domain events on topics.

This quickstart uses Trigger.dev first because it implements on-demand tasks and cron schedules. A WarpStream alternative follows.

## 1. Install the Trigger.dev adapter

```bash
pnpm add @alt-stack/workers-trigger @trigger.dev/sdk zod
```

You need Node.js 18 or newer, Zod 4, the Trigger.dev SDK 3.x, and a configured Trigger.dev project. Initialize/configure Trigger.dev using its CLI before running `trigger dev`.

`@alt-stack/workers-trigger` re-exports the entire `workers-core` API, so one import can define the router and create its runtime tasks.

## 2. Define a job router

```typescript title="src/jobs.ts"
import { init, ok } from "@alt-stack/workers-trigger";
import { z } from "zod";

export interface AppContext {
  mailer: {
    sendWelcome(input: { email: string; name: string }): Promise<void>;
  };
}

const { router, procedure } = init<AppContext>();

export const jobs = router({
  "send-welcome-email": procedure
    .input({
      payload: z.object({
        email: z.string().email(),
        name: z.string(),
      }),
    })
    .task(async ({ input, ctx }) => {
      await ctx.mailer.sendWelcome(input);
      return ok();
    }),

  "daily-digest": procedure.cron("0 9 * * *", async ({ ctx }) => {
    // Build and send the daily digest.
    return ok();
  }),
});
```

The router key is the job ID. `.task()` creates an on-demand job; `.cron()` records a schedule; `.queue()` records queue metadata. Payloads are validated before custom context is created or the handler runs.

Handlers are typed to return an Altstack `Result`; `ok()` is the successful no-value result. In the current adapters, a returned `Err` is still a normal handler return and is not converted into a provider failure. Throw an `Error` when the provider must mark the run failed or apply its retry policy.

## 3. Export Trigger.dev tasks

```typescript title="src/trigger/tasks.ts"
import { createWorker } from "@alt-stack/workers-trigger";
import { jobs, type AppContext } from "../jobs.js";

const mailer: AppContext["mailer"] = {
  async sendWelcome({ email, name }) {
    console.info(`Welcome ${name} -> ${email}`);
  },
};

export const { tasks } = createWorker(jobs, {
  createContext: () => ({ mailer }),
  onError: (error, ctx) => {
    console.error(`${ctx.jobName}:${ctx.jobId} failed`, error);
  },
});

export const sendWelcomeEmail = tasks["send-welcome-email"];
export const dailyDigest = tasks["daily-digest"];
```

Place the file under the task source directory configured for Trigger.dev. `createWorker` is synchronous and returns a record of Trigger.dev task definitions. Export the definitions you want Trigger.dev to discover.

Start the Trigger.dev development process with the configured project command, for example:

```bash
pnpm exec trigger dev
```

## 4. Trigger the task

From application code using Trigger.dev directly:

```typescript
import { tasks } from "@trigger.dev/sdk/v3";

async function main() {
  const handle = await tasks.trigger(
    "send-welcome-email",
    { email: "ada@example.com", name: "Ada" },
  );

  console.info(handle.id);
}

void main();
```

This direct Trigger.dev call uses a string task ID, so its payload is not statically tied to the router. For a type-safe caller, generate a worker SDK and pass its runtime `Topics` map to `createTriggerClient` from `@alt-stack/workers-client-trigger`. That client validates payloads without importing the server router.

## WarpStream/Kafka alternative

Install `@alt-stack/workers-warpstream`, KafkaJS, and Zod. You need a reachable Kafka-compatible broker and must provision the job topics. Default routing uses one topic per job and concatenates an optional prefix directly with the job name.

```typescript
import { createWorker } from "@alt-stack/workers-warpstream";
import { jobs } from "./jobs.js";

const worker = await createWorker(jobs, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "email-workers-v1",
  createContext: () => ({ mailer }),
});

const shutdown = () => worker.disconnect();
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

Enqueue from code that can import the router:

```typescript
import { createJobClient } from "@alt-stack/workers-warpstream";

const client = await createJobClient(jobs, {
  kafka: { brokers: ["localhost:9092"] },
});

await client.enqueue("send-welcome-email", {
  email: "ada@example.com",
  name: "Ada",
});

await client.disconnect();
```

`createWorker` and `createJobClient` must receive the same routing strategy. The generated-schema `@alt-stack/workers-client-warpstream` binding supports only topic-per-job routing.

## Server adapters versus clients

| Boundary | Package | Input contract | What it does |
| --- | --- | --- | --- |
| definition | `workers-core` | `WorkerRouter` | defines jobs; no provider connection |
| server | `workers-trigger` | `WorkerRouter` | creates Trigger.dev task definitions |
| server | `workers-warpstream` | `WorkerRouter` | starts a KafkaJS consumer and executes jobs |
| co-located client | `workers-warpstream#createJobClient` | live `WorkerRouter` | enqueues with router-derived types |
| generated client | `workers-client-trigger` | generated Zod `JobsMap` | triggers through Trigger.dev |
| generated client | `workers-client-warpstream` | generated Zod `JobsMap` | publishes topic-per-job messages |

## Next steps

- [Workers common patterns](./common-patterns.md) covers provider differences, routing, middleware, metrics, and generated contracts.
- [Workers core API](./api/core.md) documents every framework-neutral export.
- [Trigger adapter API](./api/trigger.md) and [WarpStream adapter API](./api/warpstream.md) document server behavior.
