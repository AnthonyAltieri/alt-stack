import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import type {
  CreateTaskRequest,
  StoredTask,
  TaskJobRecord,
} from "./types.js";

interface StoredTaskRow extends Omit<StoredTask, "alwaysFail"> {
  alwaysFail: number;
}

interface TaskJobRecordRow extends Omit<TaskJobRecord, "alwaysFail"> {
  alwaysFail: number;
}

export class TaskRepository {
  private readonly db: Database.Database;

  constructor(databasePath: string) {
    this.db = new Database(databasePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
  }

  ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        fail_after_retries INTEGER NOT NULL DEFAULT 0,
        always_fail INTEGER NOT NULL DEFAULT 0 CHECK (always_fail IN (0, 1)),
        processing_status TEXT NOT NULL CHECK (processing_status IN ('queued', 'completed', 'enqueue_failed')),
        job_id TEXT UNIQUE,
        retry_budget INTEGER NOT NULL DEFAULT 0,
        retry_backoff_type TEXT NOT NULL DEFAULT 'static' CHECK (retry_backoff_type IN ('static', 'linear', 'exponential')),
        retry_backoff_starting_seconds INTEGER NOT NULL DEFAULT 0,
        redrive_budget INTEGER,
        result TEXT,
        enqueue_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks (updated_at DESC, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_job ON tasks (job_id);
    `);

    if (!this.hasColumn("tasks", "fail_after_retries")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN fail_after_retries INTEGER NOT NULL DEFAULT 0");
    }
    if (!this.hasColumn("tasks", "always_fail")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN always_fail INTEGER NOT NULL DEFAULT 0");
    }
    if (!this.hasColumn("tasks", "retry_budget")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN retry_budget INTEGER NOT NULL DEFAULT 0");
    }
    if (!this.hasColumn("tasks", "retry_backoff_type")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN retry_backoff_type TEXT NOT NULL DEFAULT 'static'");
    }
    if (!this.hasColumn("tasks", "retry_backoff_starting_seconds")) {
      this.db.exec(
        "ALTER TABLE tasks ADD COLUMN retry_backoff_starting_seconds INTEGER NOT NULL DEFAULT 0",
      );
    }
    if (!this.hasColumn("tasks", "redrive_budget")) {
      this.db.exec("ALTER TABLE tasks ADD COLUMN redrive_budget INTEGER");
    }

    if (this.hasColumn("tasks", "failure_mode")) {
      this.db.exec(`
        UPDATE tasks
        SET
          fail_after_retries = CASE failure_mode
            WHEN 'retry_once' THEN 1
            ELSE fail_after_retries
          END,
          always_fail = CASE failure_mode
            WHEN 'dead_letter' THEN 1
            ELSE always_fail
          END
      `);
    }
  }

  close(): void {
    this.db.close();
  }

  createTask(
    input: CreateTaskRequest & Pick<
      StoredTask,
      | "retryBudget"
      | "retryBackoffType"
      | "retryBackoffStartingSeconds"
      | "redriveBudget"
    >,
  ): StoredTask {
    const now = new Date().toISOString();
    const task: StoredTask = {
      id: randomUUID(),
      title: input.title.trim(),
      description: input.description ?? null,
      failAfterRetries: input.failAfterRetries,
      alwaysFail: input.alwaysFail,
      processingStatus: "queued",
      jobId: null,
      retryBudget: input.retryBudget,
      retryBackoffType: input.retryBackoffType,
      retryBackoffStartingSeconds: input.retryBackoffStartingSeconds,
      redriveBudget: input.redriveBudget ?? null,
      result: null,
      enqueueError: null,
      createdAt: now,
      updatedAt: now,
    };
    const persistedTask = {
      ...task,
      alwaysFail: task.alwaysFail ? 1 : 0,
      failureMode: toLegacyFailureMode(task),
    };

    const insertStatement = this.hasColumn("tasks", "failure_mode")
      ? `
        INSERT INTO tasks (
          id,
          title,
          description,
          failure_mode,
          fail_after_retries,
          always_fail,
          processing_status,
          job_id,
          retry_budget,
          retry_backoff_type,
          retry_backoff_starting_seconds,
          redrive_budget,
          result,
          enqueue_error,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @title,
          @description,
          @failureMode,
          @failAfterRetries,
          @alwaysFail,
          @processingStatus,
          @jobId,
          @retryBudget,
          @retryBackoffType,
          @retryBackoffStartingSeconds,
          @redriveBudget,
          @result,
          @enqueueError,
          @createdAt,
          @updatedAt
        )
      `
      : `
        INSERT INTO tasks (
          id,
          title,
          description,
          fail_after_retries,
          always_fail,
          processing_status,
          job_id,
          retry_budget,
          retry_backoff_type,
          retry_backoff_starting_seconds,
          redrive_budget,
          result,
          enqueue_error,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @title,
          @description,
          @failAfterRetries,
          @alwaysFail,
          @processingStatus,
          @jobId,
          @retryBudget,
          @retryBackoffType,
          @retryBackoffStartingSeconds,
          @redriveBudget,
          @result,
          @enqueueError,
          @createdAt,
          @updatedAt
        )
      `;

    this.db.prepare(insertStatement).run(persistedTask);

    return task;
  }

  getTask(taskId: string): StoredTask | null {
    const row = this.db
      .prepare(
        `
        SELECT
          id,
          title,
          description,
          fail_after_retries AS failAfterRetries,
          always_fail AS alwaysFail,
          processing_status AS processingStatus,
          job_id AS jobId,
          retry_budget AS retryBudget,
          retry_backoff_type AS retryBackoffType,
          retry_backoff_starting_seconds AS retryBackoffStartingSeconds,
          redrive_budget AS redriveBudget,
          result,
          enqueue_error AS enqueueError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM tasks
        WHERE id = ?
      `,
      )
      .get(taskId) as StoredTaskRow | undefined;

    return row ? mapStoredTaskRow(row) : null;
  }

  listTasks(limit = 40): StoredTask[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          id,
          title,
          description,
          fail_after_retries AS failAfterRetries,
          always_fail AS alwaysFail,
          processing_status AS processingStatus,
          job_id AS jobId,
          retry_budget AS retryBudget,
          retry_backoff_type AS retryBackoffType,
          retry_backoff_starting_seconds AS retryBackoffStartingSeconds,
          redrive_budget AS redriveBudget,
          result,
          enqueue_error AS enqueueError,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM tasks
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?
      `,
      )
      .all(limit) as StoredTaskRow[];

    return rows.map(mapStoredTaskRow);
  }

  attachJobToTask(taskId: string, jobId: string): void {
    this.assertTaskExists(taskId);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE tasks
        SET job_id = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(jobId, now, taskId);
  }

  markTaskEnqueueFailed(taskId: string, errorMessage: string): void {
    this.assertTaskExists(taskId);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE tasks
        SET processing_status = 'enqueue_failed', enqueue_error = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(errorMessage, now, taskId);
  }

  completeTask(taskId: string, result: string): void {
    this.assertTaskExists(taskId);

    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE tasks
        SET processing_status = 'completed', result = ?, enqueue_error = NULL, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(result, now, taskId);
  }

  listTaskJobRecords(limit = 25): TaskJobRecord[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          id AS taskId,
          title,
          description,
          fail_after_retries AS failAfterRetries,
          always_fail AS alwaysFail,
          job_id AS jobId,
          retry_budget AS retryBudget,
          retry_backoff_type AS retryBackoffType,
          retry_backoff_starting_seconds AS retryBackoffStartingSeconds,
          redrive_budget AS redriveBudget,
          created_at AS createdAt,
          updated_at AS updatedAt,
          processing_status AS processingStatus,
          result,
          enqueue_error AS enqueueError
        FROM tasks
        WHERE job_id IS NOT NULL
        ORDER BY updated_at DESC, created_at DESC
        LIMIT ?
      `,
      )
      .all(limit) as TaskJobRecordRow[];

    return rows.map(mapTaskJobRecordRow);
  }

  findTaskJobRecords(jobIds: string[]): TaskJobRecord[] {
    if (jobIds.length === 0) {
      return [];
    }

    const placeholders = jobIds.map(() => "?").join(", ");

    const rows = this.db
      .prepare(
        `
        SELECT
          id AS taskId,
          title,
          description,
          fail_after_retries AS failAfterRetries,
          always_fail AS alwaysFail,
          job_id AS jobId,
          retry_budget AS retryBudget,
          retry_backoff_type AS retryBackoffType,
          retry_backoff_starting_seconds AS retryBackoffStartingSeconds,
          redrive_budget AS redriveBudget,
          created_at AS createdAt,
          updated_at AS updatedAt,
          processing_status AS processingStatus,
          result,
          enqueue_error AS enqueueError
        FROM tasks
        WHERE job_id IN (${placeholders})
      `,
      )
      .all(...jobIds) as TaskJobRecordRow[];

    return rows.map(mapTaskJobRecordRow);
  }

  private assertTaskExists(taskId: string): void {
    const row = this.db
      .prepare(`SELECT id FROM tasks WHERE id = ?`)
      .get(taskId) as { id: string } | undefined;

    if (!row) {
      throw new Error(`Task ${taskId} does not exist`);
    }
  }

  private hasColumn(tableName: string, columnName: string): boolean {
    const rows = this.db
      .prepare(`PRAGMA table_info(${tableName})`)
      .all() as Array<{ name: string }>;

    return rows.some((row) => row.name === columnName);
  }
}

export function createTaskRepository(databasePath: string): TaskRepository {
  const repository = new TaskRepository(databasePath);
  repository.ensureSchema();
  return repository;
}

function mapStoredTaskRow(row: StoredTaskRow): StoredTask {
  return {
    ...row,
    alwaysFail: Boolean(row.alwaysFail),
  };
}

function mapTaskJobRecordRow(row: TaskJobRecordRow): TaskJobRecord {
  return {
    ...row,
    alwaysFail: Boolean(row.alwaysFail),
  };
}

function toLegacyFailureMode(
  task: Pick<StoredTask, "failAfterRetries" | "alwaysFail">,
): "success" | "retry_once" | "dead_letter" {
  if (task.alwaysFail) {
    return "dead_letter";
  }

  return task.failAfterRetries > 0 ? "retry_once" : "success";
}
