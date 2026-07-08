# Task Queue State Example

A runnable task-queue example that uses local Docker Kafka for transport, ClickHouse for queue-state tracking, and two UI surfaces:
- `/demo` for the live single-queue workflow
- `/dashboard` for an illustrative production observability view

## Features

- Queue tasks through the live demo UI
- Control whether a task succeeds immediately, fails for a configured number of retries, or always fails
- Configure a default redrive budget and override it per task at enqueue time
- Inspect queue-state transitions, dead letters, exhausted failures, and redrives from the demo page
- Explore what a production multi-queue, multi-region observability dashboard could look like using the same state model
- Local Kafka transport plus ClickHouse-backed queue-state storage
- Typed environment validation via `@t3-oss/env-core`

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker

## Setup

```bash
pnpm install
```

The checked-in `.env.example` is configured for Docker Compose and points the apps
at the local Kafka service with `KAFKA_BROKERS=kafka:9092`.

If you want to override those defaults locally, copy the file and edit it:

```bash
cp examples/worker-state/.env.example examples/worker-state/.env
```

Compose loads the checked-in defaults and then applies any matching values from
`.env`, so you can override just the fields you care about.

`DEFAULT_REDRIVE_BUDGET=1` is also enabled in `.env.example`, which means a
dead-lettered task can be manually redriven once by default. Clear that value
to make redrives unlimited, or override the budget for a specific task from the
dashboard form.

The local ClickHouse password in `.env.example` is intentional. Do not leave
`CLICKHOUSE_PASSWORD` blank or the ClickHouse container will disable network
access for the default user.

If you run the API, worker, or dispatcher directly on the host instead of in
Compose, switch:

```bash
KAFKA_BROKERS=localhost:19092
```

You can still point the example at another Kafka-compatible provider by
overriding the `KAFKA_*` values.

## Run With Docker Compose

```bash
cd examples/worker-state
docker compose up --build
```

Open:

- Production dashboard concept: `http://localhost:3005/dashboard`
- Live demo: `http://localhost:3005/demo`
- Kafka from the host: `localhost:19092`

## Suggested Demo Tasks

- Success only
  - Title: `Generate invoice export`
  - Details: `Prepare the April invoice batch for downstream delivery`
  - Fail after retries: `0`
  - Always fail: `off`
- Fail once, then succeed
  - Title: `Rebuild analytics cache`
  - Details: `Warm the primary dashboard cache after the next retry`
  - Fail after retries: `1`
  - Always fail: `off`
  - Retry budget: `1`
- Always fail into dead letter
  - Title: `Replay poisoned event`
  - Details: `Keep failing until the task lands in dead letter`
  - Fail after retries: `0`
  - Always fail: `on`
  - Retry budget: `1`
  - Redrive budget: `1`
- No redrives allowed
  - Title: `Reject permanent poison pill`
  - Details: `Dead-letter immediately and do not allow a manual replay`
  - Fail after retries: `0`
  - Always fail: `on`
  - Retry budget: `1`
  - Redrive budget: `0`

## Manual Verification

1. Start the stack:

   ```bash
   cd examples/worker-state
   docker compose up --build
   ```

   Wait for these log lines before testing:

   - `Task queue example API running at http://localhost:3005`
   - `Task queue example worker started`
   - `Task queue example dispatcher started`

2. Open the UIs:

   - Production dashboard concept: `http://localhost:3005/dashboard`
   - Live demo: `http://localhost:3005/demo`

   Use `/dashboard` to review the illustrative production slicing surface, then use `/demo` for the runnable task flow below.

3. Verify the happy path:

   - Queue a task with `fail after retries = 0` and `always fail = off`.
   - Confirm the task moves to `succeeded`.
   - Confirm the latest jobs list shows attempt `1`.

4. Verify the retry path:

   - Queue a task with `fail after retries = 1`, `always fail = off`, and retry budget `1`.
   - Confirm the task briefly enters `retry_scheduled`.
   - Wait for the dispatcher to redeliver it.
   - Confirm the task eventually reaches `succeeded` on attempt `2`.

5. Verify the dead-letter path:

   - Queue a task with `always fail = on` and retry budget `1`.
   - Confirm it appears in the dashboard dead-letter panel.
   - Confirm the job settles in `dead_letter` on attempt `2`.
   - Confirm the dashboard shows the redrive usage and remaining budget for that task.

6. Verify the redrive path:

   - Redrive the dead-lettered job from the dashboard.
   - Confirm it appears in the redrive history.
   - Because `.env.example` sets the default redrive budget to `1`, confirm the task returns as terminal `failed` after the replay instead of going back to `dead_letter`.
   - Confirm it disappears from the DLQ after that final failed replay.

7. Verify a zero-budget task:

   - Queue a task with `always fail = on`, retry budget `1`, and redrive budget `0`.
   - Confirm it reaches `dead_letter`.
   - Confirm the dead-letter card does not offer a redrive action for that task.

8. Reset the example when you are done:

   ```bash
   docker compose down --volumes
   ```

## Notes

- SQLite stores task definitions, retry behavior, each task’s effective redrive budget, and final task output.
- ClickHouse stores queue-state transitions, retries, dead letters, exhausted failures, and redrives.
- Kafka and ClickHouse both run locally in Docker for the default path.
