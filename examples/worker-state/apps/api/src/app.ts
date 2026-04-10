import { Hono } from "hono";
import {
  resolveExecutionConfig,
  type QueueDefinition,
  type QueueJobStateSnapshot,
  type RedriveRecord,
  type Storage,
} from "@alt-stack/workers-core";
import {
  createTaskRequestSchema,
  type DashboardActivity,
  type DashboardData,
  type DashboardStats,
  type StoredTask,
  type TaskJobRecord,
  type TaskJobView,
  type TaskQueueClient,
  type TaskRepository,
  type TaskView,
} from "@worker-state/shared";
import {
  renderProductionDashboardPage,
  renderTaskDemoPage,
} from "./views.js";

interface ApiAppDependencies {
  repository: TaskRepository;
  queueClient: TaskQueueClient;
  queue: QueueDefinition;
  storage: Pick<
    Storage,
    "getJobState" | "listDeadLetters" | "listRedrives" | "requestRedrive"
  >;
}

export function createApiApp(dependencies: ApiAppDependencies) {
  const app = new Hono();

  app.get("/", (c) => c.redirect("/dashboard", 302));

  app.get("/dashboard", (c) =>
    c.html(renderProductionDashboardPage()));

  app.get("/demo", (c) =>
    c.html(
      renderTaskDemoPage({
        defaultRetryBudget: dependencies.queue.config?.retry?.budget ?? 0,
        defaultRetryBackoffType: dependencies.queue.config?.retry?.backoff?.type ?? "static",
        defaultRetryBackoffStartingSeconds:
          dependencies.queue.config?.retry?.backoff?.startingSeconds ?? 0,
        defaultRedriveBudget: dependencies.queue.config?.redrive?.budget,
      }),
    ));
  app.get("/ops", (c) => c.redirect("/demo", 302));

  app.get("/health", (c) => c.json({ ok: true }));

  app.get("/api/dashboard", async (c) => {
    return c.json(
      await buildDashboardData(
        dependencies.repository,
        dependencies.storage,
        dependencies.queue.name,
      ),
    );
  });

  app.get("/api/tasks", async (c) => {
    return c.json(await presentTasks(dependencies.repository.listTasks(), dependencies.storage));
  });

  app.get("/api/tasks/:id", async (c) => {
    const task = dependencies.repository.getTask(c.req.param("id"));
    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    return c.json(await presentTask(task, dependencies.storage));
  });

  app.post("/api/tasks", async (c) => {
    const payload = await c.req.json().catch(() => undefined);
    const parsed = createTaskRequestSchema.safeParse(payload);

    if (!parsed.success) {
      return c.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid task payload" },
        400,
      );
    }

    const effectiveConfig = resolveExecutionConfig(dependencies.queue, parsed.data.config);
    const task = dependencies.repository.createTask({
      ...parsed.data,
      retryBudget: effectiveConfig.retry.budget,
      retryBackoffType: effectiveConfig.retry.backoff.type,
      retryBackoffStartingSeconds: effectiveConfig.retry.backoff.startingSeconds,
      redriveBudget: effectiveConfig.redrive?.budget ?? null,
    });

    try {
      const { jobId } = await dependencies.queueClient.enqueueTask(
        { taskId: task.id },
        task.id,
        {
          config: effectiveConfig,
        },
      );

      dependencies.repository.attachJobToTask(task.id, jobId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      dependencies.repository.markTaskEnqueueFailed(
        task.id,
        `Failed to enqueue task: ${message}`,
      );

      return c.json({ error: `Failed to enqueue task: ${message}` }, 502);
    }

    const updated = dependencies.repository.getTask(task.id);
    return c.json(await presentTask(updated!, dependencies.storage), 201);
  });

  app.get("/api/ops/jobs", async (c) => {
    const jobs = dependencies.repository.listTaskJobRecords(30);
    return c.json(await presentTaskJobRecords(jobs, dependencies.storage));
  });

  app.get("/api/ops/dead-letters", async (c) => {
    return c.json(
      await presentDeadLetters(
        dependencies.repository,
        dependencies.storage,
        dependencies.queue.name,
      ),
    );
  });

  app.get("/api/ops/redrives", async (c) => {
    return c.json(
      await presentRedrives(
        dependencies.repository,
        dependencies.storage,
        dependencies.queue.name,
      ),
    );
  });

  app.post("/api/ops/jobs/:jobId/redrive", async (c) => {
    const payload = await c.req.json().catch(() => ({}));
    const reason = typeof payload?.reason === "string" && payload.reason.trim()
      ? payload.reason.trim()
      : "Manual redrive from ops UI";

    try {
      const record = await dependencies.storage.requestRedrive({
        jobId: c.req.param("jobId"),
        requestedBy: "task-queue-example-ops",
        reason,
      });

      return c.json(record, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("unknown job") ? 404 : 409;
      return c.json({ error: message }, status);
    }
  });

  app.onError((error, c) => {
    console.error(error);
    return c.json({ error: error.message }, 500);
  });

  return app;
}

async function buildDashboardData(
  repository: TaskRepository,
  storage: Pick<Storage, "getJobState" | "listDeadLetters" | "listRedrives">,
  queueName: string,
): Promise<DashboardData> {
  const [tasks, jobs, deadLetters, redrives] = await Promise.all([
    presentTasks(repository.listTasks(30), storage),
    presentTaskJobRecords(repository.listTaskJobRecords(18), storage),
    presentDeadLetters(repository, storage, queueName),
    presentRedrives(repository, storage, queueName),
  ]);

  return {
    stats: buildDashboardStats(tasks),
    tasks,
    jobs,
    deadLetters,
    redrives,
    activity: buildActivity(tasks, redrives),
  };
}

async function presentTasks(
  tasks: StoredTask[],
  storage: Pick<Storage, "getJobState">,
): Promise<TaskView[]> {
  return Promise.all(tasks.map((task) => presentTask(task, storage)));
}

async function presentTask(
  task: StoredTask,
  storage: Pick<Storage, "getJobState">,
): Promise<TaskView> {
  if (!task.jobId) {
    const redrive = buildRedrivePresentation(
      inferFallbackState(task),
      task.redriveBudget,
      0,
    );

    return {
      ...task,
      state: inferFallbackState(task),
      attempt: null,
      deadLetterReason: undefined,
      updatedAtFromQueue: null,
      retryCount: 0,
      ...redrive,
    };
  }

  const queueState = await storage.getJobState(task.jobId);
  const state = queueState?.state ?? inferFallbackState(task);
  const effectiveRetryBudget = queueState?.retryBudget ?? task.retryBudget;
  const effectiveRetryBackoffType = queueState?.retryBackoffType ?? task.retryBackoffType;
  const effectiveRetryBackoffStartingSeconds = queueState?.retryBackoffStartingSeconds
    ?? task.retryBackoffStartingSeconds;
  const effectiveRedriveBudget = queueState?.redriveBudget ?? task.redriveBudget;
  const redrive = buildRedrivePresentation(
    state,
    effectiveRedriveBudget,
    queueState?.redriveCount ?? 0,
  );

  return {
    ...task,
    retryBudget: effectiveRetryBudget,
    retryBackoffType: effectiveRetryBackoffType,
    retryBackoffStartingSeconds: effectiveRetryBackoffStartingSeconds,
    redriveBudget: effectiveRedriveBudget,
    state,
    attempt: queueState?.attempt ?? null,
    deadLetterReason: queueState?.deadLetterReason,
    updatedAtFromQueue: queueState?.updatedAt ?? null,
    retryCount: queueState?.retryCount ?? 0,
    ...redrive,
  };
}

async function presentTaskJobRecords(
  records: TaskJobRecord[],
  storage: Pick<Storage, "getJobState">,
): Promise<TaskJobView[]> {
  return Promise.all(
    records.map(async (record) => {
      const state = await storage.getJobState(record.jobId);
      return presentTaskJobRecord(record, state);
    }),
  );
}

async function presentDeadLetters(
  repository: TaskRepository,
  storage: Pick<Storage, "listDeadLetters">,
  queueName: string,
): Promise<TaskJobView[]> {
  const deadLetters = await storage.listDeadLetters({
    queueName,
    limit: 12,
  });
  const relatedJobs = repository.findTaskJobRecords(deadLetters.map((item) => item.jobId));
  const byJobId = new Map(relatedJobs.map((item) => [item.jobId, item]));

  return deadLetters.map((item) =>
    presentTaskJobRecord(byJobId.get(item.jobId) ?? createUnknownTaskRecord(item), item)
  );
}

async function presentRedrives(
  repository: TaskRepository,
  storage: Pick<Storage, "listRedrives">,
  queueName: string,
): Promise<Array<RedriveRecord & Partial<TaskJobRecord>>> {
  const redrives = await storage.listRedrives({
    queueName,
    limit: 12,
  });
  const relatedJobs = repository.findTaskJobRecords(redrives.map((item) => item.jobId));
  const byJobId = new Map(relatedJobs.map((item) => [item.jobId, item]));

  return redrives.map((record) => {
    const relatedTask = byJobId.get(record.jobId);

    return {
      ...(relatedTask
        ? {
            ...relatedTask,
            redriveBudget: relatedTask.redriveBudget ?? undefined,
          }
        : {}),
      ...record,
    };
  });
}

function presentTaskJobRecord(
  record: TaskJobRecord,
  state: QueueJobStateSnapshot | null,
): TaskJobView {
  const presentationState = state?.state ?? inferFallbackState(record);
  const effectiveRetryBudget = state?.retryBudget ?? record.retryBudget;
  const effectiveRetryBackoffType = state?.retryBackoffType ?? record.retryBackoffType;
  const effectiveRetryBackoffStartingSeconds = state?.retryBackoffStartingSeconds
    ?? record.retryBackoffStartingSeconds;
  const effectiveRedriveBudget = state?.redriveBudget ?? record.redriveBudget;
  const redrive = buildRedrivePresentation(
    presentationState,
    effectiveRedriveBudget,
    state?.redriveCount ?? 0,
  );

  return {
    ...record,
    retryBudget: effectiveRetryBudget,
    retryBackoffType: effectiveRetryBackoffType,
    retryBackoffStartingSeconds: effectiveRetryBackoffStartingSeconds,
    redriveBudget: effectiveRedriveBudget,
    state: presentationState,
    attempt: state?.attempt ?? null,
    deadLetterReason: state?.deadLetterReason,
    updatedAtFromQueue: state?.updatedAt ?? null,
    retryCount: state?.retryCount ?? 0,
    ...redrive,
  };
}

function buildDashboardStats(tasks: TaskView[]): DashboardStats {
  const stats: DashboardStats = {
    total: tasks.length,
    queued: 0,
    running: 0,
    retryScheduled: 0,
    succeeded: 0,
    deadLetter: 0,
    failed: 0,
    enqueueFailed: 0,
  };

  for (const task of tasks) {
    switch (task.state) {
      case "queued":
      case "redrive_requested":
        stats.queued += 1;
        break;
      case "running":
        stats.running += 1;
        break;
      case "retry_scheduled":
        stats.retryScheduled += 1;
        break;
      case "succeeded":
        stats.succeeded += 1;
        break;
      case "dead_letter":
        stats.deadLetter += 1;
        break;
      case "failed":
        stats.failed += 1;
        break;
      case "enqueue_failed":
        stats.enqueueFailed += 1;
        break;
    }
  }

  return stats;
}

function buildActivity(
  tasks: TaskView[],
  redrives: Array<RedriveRecord & Partial<TaskJobRecord>>,
): DashboardActivity[] {
  const events = tasks.flatMap((task) => {
    const taskEvents: DashboardActivity[] = [
      {
        id: `${task.id}:submitted`,
        timestamp: task.createdAt,
        type: "submitted",
        label: task.title,
        detail: `Queued with behavior ${formatFailureBehavior(task)}`,
      },
    ];

    switch (task.state) {
      case "running":
        taskEvents.push({
          id: `${task.id}:running`,
          timestamp: task.updatedAtFromQueue ?? task.updatedAt,
          type: "running",
          label: task.title,
          detail: `Running attempt ${task.attempt ?? 1}`,
        });
        break;
      case "retry_scheduled":
        taskEvents.push({
          id: `${task.id}:retry`,
          timestamp: task.updatedAtFromQueue ?? task.updatedAt,
          type: "retry",
          label: task.title,
          detail: `Retry ${task.retryCount}/${task.retryBudget} scheduled after attempt ${task.attempt ?? 1}`,
        });
        break;
      case "succeeded":
        taskEvents.push({
          id: `${task.id}:completed`,
          timestamp: task.updatedAtFromQueue ?? task.updatedAt,
          type: "completed",
          label: task.title,
          detail: `Completed on attempt ${task.attempt ?? 1}`,
        });
        break;
      case "dead_letter":
        taskEvents.push({
          id: `${task.id}:dead-letter`,
          timestamp: task.updatedAtFromQueue ?? task.updatedAt,
          type: "dead_letter",
          label: task.title,
          detail: task.deadLetterReason?.message ?? "Moved to dead letter",
        });
        break;
      case "failed":
        taskEvents.push({
          id: `${task.id}:failed`,
          timestamp: task.updatedAtFromQueue ?? task.updatedAt,
          type: "failed",
          label: task.title,
          detail: task.redriveBudget === null
            ? "Processing failed"
            : `Failed after using redrive budget ${task.redriveCount}/${task.redriveBudget}`,
        });
        break;
      case "enqueue_failed":
        taskEvents.push({
          id: `${task.id}:enqueue-failed`,
          timestamp: task.updatedAt,
          type: "enqueue_failed",
          label: task.title,
          detail: task.enqueueError ?? "Failed before Kafka publish",
        });
        break;
      case "queued":
      case "redrive_requested":
        break;
    }

    return taskEvents;
  });

  for (const redrive of redrives) {
    events.push({
      id: `${redrive.redriveId}:redrive`,
      timestamp: redrive.requestedAt,
      type: "redrive_requested",
      label: redrive.title ?? redrive.jobId,
      detail: [
        redrive.reason ?? "Manual redrive requested",
        formatRetryUsage(redrive.retryCount, redrive.retryBudget),
        formatRedriveUsage(redrive.redriveCount, redrive.redriveBudget),
      ].join(" • "),
    });
  }

  return events
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, 18);
}

function inferFallbackState(
  task: Pick<StoredTask, "processingStatus" | "result"> | Pick<TaskJobRecord, "processingStatus" | "result">,
) {
  if (task.processingStatus === "enqueue_failed") {
    return "enqueue_failed" as const;
  }

  if (task.result) {
    return "succeeded" as const;
  }

  return "queued" as const;
}

function createUnknownTaskRecord(state: QueueJobStateSnapshot): TaskJobRecord {
  return {
    taskId: "unknown-task",
    title: "Unknown task",
    description: null,
    failAfterRetries: 0,
    alwaysFail: true,
    jobId: state.jobId,
    retryBudget: state.retryBudget,
    retryBackoffType: state.retryBackoffType,
    retryBackoffStartingSeconds: state.retryBackoffStartingSeconds,
    redriveBudget: state.redriveBudget ?? null,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    processingStatus: "queued",
    result: null,
    enqueueError: null,
  };
}

function formatFailureBehavior(
  task: Pick<TaskView, "failAfterRetries" | "alwaysFail">,
) {
  if (task.alwaysFail) {
    return "always fail";
  }

  if (task.failAfterRetries === 0) {
    return "success only";
  }

  return task.failAfterRetries === 1
    ? "fail after 1 retry"
    : `fail after ${task.failAfterRetries} retries`;
}

function formatRetryUsage(retryCount: number, retryBudget: number) {
  return `${retryCount}/${retryBudget} used`;
}

function buildRedrivePresentation(
  state: TaskView["state"] | TaskJobView["state"],
  redriveBudget: number | null,
  redriveCount: number,
) {
  const redriveRemaining = redriveBudget === null
    ? null
    : Math.max(redriveBudget - redriveCount, 0);

  return {
    redriveCount,
    redriveRemaining,
    canRedrive: state === "dead_letter"
      && (redriveBudget === null || redriveCount < redriveBudget),
  };
}

function formatRedriveUsage(redriveCount: number, redriveBudget?: number | null) {
  if (redriveBudget === null || redriveBudget === undefined) {
    return `${redriveCount} used / unlimited`;
  }

  return `${redriveCount}/${redriveBudget} used`;
}
