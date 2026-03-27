import {
  buildQueueJobHistory,
  createRedriveId,
  reduceQueueJobEvent,
} from "@alt-stack/workers-state-core";
import type {
  DueDispatch,
  DueDispatchQuery,
  QueueJobEvent,
  QueueJobHistory,
  QueueJobStateSnapshot,
  RedriveQuery,
  RedriveRecord,
  RedriveRequest,
  Storage,
} from "@alt-stack/workers-state-core";
import { getTableNames, buildSchemaStatements } from "./sql.js";

export interface ClickHouseStorageOptions {
  url: string;
  database?: string;
  username?: string;
  password?: string;
  tablePrefix?: string;
  fetch?: typeof globalThis.fetch;
}

interface ClickHouseEventRow {
  event_id: string;
  event_type: QueueJobEvent["type"];
  event_time: string;
  created_at: string;
  job_id: string;
  job_name: string;
  queue_name: string;
  attempt: number;
  state: string;
  scheduled_at: string | null;
  dispatch_kind: string;
  redrive_id: string | null;
  payload_json: string;
  queue_json: string;
  headers_json: string;
  error_json: string;
  dead_letter_reason_json: string;
  requested_by: string | null;
  requested_reason: string | null;
}

interface ClickHouseCurrentRow {
  job_id: string;
  queue_name: string;
  job_name: string;
  created_at: string;
  updated_at: string;
  state: string;
  attempt: number;
  scheduled_at: string | null;
  dispatch_kind: string;
  redrive_id: string | null;
  payload_json: string;
  queue_json: string;
  headers_json: string;
  error_json: string;
  dead_letter_reason_json: string;
}

type ClickHouseRedriveRow = {
  event_type: "redrive_requested" | "redrive_dispatched";
  job_id: string;
  job_name: string;
  queue_name: string;
  redrive_id: string;
  event_time: string;
  requested_by: string | null;
  requested_reason: string | null;
};

const JSON_FORMAT = "JSONEachRow";

export class ClickHouseStorage implements Storage {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly database?: string;
  private readonly authHeader?: string;
  private readonly tables: ReturnType<typeof getTableNames>;

  constructor(private readonly options: ClickHouseStorageOptions) {
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.database = options.database;
    this.tables = getTableNames(options.tablePrefix);

    if (options.username !== undefined) {
      const auth = `${options.username}:${options.password ?? ""}`;
      this.authHeader = `Basic ${Buffer.from(auth).toString("base64")}`;
    }
  }

  async ensureSchema(): Promise<void> {
    for (const statement of buildSchemaStatements(this.tables)) {
      await this.execute(statement);
    }
  }

  async append(events: QueueJobEvent[]): Promise<void> {
    if (events.length === 0) return;

    await this.insertJsonEachRow(
      this.tables.events,
      events.map((event) => this.toEventRow(event)),
    );
    await this.insertJsonEachRow(
      this.tables.current,
      events.map((event) => this.toCurrentRow(event)),
    );
  }

  async getJob(jobId: string): Promise<QueueJobHistory | null> {
    const sql = `
SELECT *
FROM ${this.tables.events}
WHERE job_id = ${this.escapeString(jobId)}
ORDER BY event_time ASC, event_id ASC
FORMAT ${JSON_FORMAT}
    `.trim();
    const rows = await this.queryRows<ClickHouseEventRow>(sql);
    if (rows.length === 0) return null;
    return buildQueueJobHistory(rows.map((row) => this.fromEventRow(row)));
  }

  async getJobState(jobId: string): Promise<QueueJobStateSnapshot | null> {
    const sql = `
SELECT *
FROM ${this.tables.current} FINAL
WHERE job_id = ${this.escapeString(jobId)}
LIMIT 1
FORMAT ${JSON_FORMAT}
    `.trim();
    const rows = await this.queryRows<ClickHouseCurrentRow>(sql);
    const row = rows[0];
    return row ? this.fromCurrentRow(row) : null;
  }

  async listDeadLetters(query: { queueName?: string; jobName?: string; limit?: number } = {}): Promise<QueueJobStateSnapshot[]> {
    const limit = query.limit ?? 100;
    const filters = [
      "state = 'dead_letter'",
      query.queueName ? `queue_name = ${this.escapeString(query.queueName)}` : null,
      query.jobName ? `job_name = ${this.escapeString(query.jobName)}` : null,
    ].filter(Boolean);
    const sql = `
SELECT *
FROM ${this.tables.current} FINAL
WHERE ${filters.join(" AND ")}
ORDER BY updated_at DESC
LIMIT ${limit}
FORMAT ${JSON_FORMAT}
    `.trim();
    const rows = await this.queryRows<ClickHouseCurrentRow>(sql);
    return rows.map((row) => this.fromCurrentRow(row));
  }

  async listRedrives(query: RedriveQuery = {}): Promise<RedriveRecord[]> {
    const limit = query.limit ?? 100;
    const filters = [
      "event_type IN ('redrive_requested', 'redrive_dispatched')",
      query.queueName ? `queue_name = ${this.escapeString(query.queueName)}` : null,
      query.jobName ? `job_name = ${this.escapeString(query.jobName)}` : null,
    ].filter(Boolean);
    const sql = `
SELECT event_type, job_id, job_name, queue_name, redrive_id, event_time, requested_by, requested_reason
FROM ${this.tables.events}
WHERE ${filters.join(" AND ")}
ORDER BY event_time DESC
LIMIT ${limit * 4}
FORMAT ${JSON_FORMAT}
    `.trim();
    const rows = await this.queryRows<ClickHouseRedriveRow>(sql);
    return reduceRedriveRows(rows).slice(0, limit);
  }

  async listDueDispatches(query: DueDispatchQuery = {}): Promise<DueDispatch[]> {
    const limit = query.limit ?? 100;
    const now = (query.now ?? new Date()).toISOString();
    const filters = [
      "state IN ('retry_scheduled', 'redrive_requested')",
      `scheduled_at <= parseDateTime64BestEffort(${this.escapeString(now)})`,
      query.queueName ? `queue_name = ${this.escapeString(query.queueName)}` : null,
    ].filter(Boolean);
    const sql = `
SELECT *
FROM ${this.tables.current} FINAL
WHERE ${filters.join(" AND ")}
ORDER BY scheduled_at ASC, updated_at ASC
LIMIT ${limit}
FORMAT ${JSON_FORMAT}
    `.trim();
    const rows = await this.queryRows<ClickHouseCurrentRow>(sql);
    return rows.map((row) => {
      const snapshot = this.fromCurrentRow(row);
      return {
        kind: snapshot.state === "retry_scheduled" ? "retry" : "redrive",
        jobId: snapshot.jobId,
        jobName: snapshot.jobName,
        queueName: snapshot.queueName,
        attempt: snapshot.attempt,
        scheduledAt: snapshot.scheduledAt,
        payload: snapshot.payload,
        queue: snapshot.queue,
        headers: snapshot.headers,
        dispatchKind: snapshot.dispatchKind,
        redriveId: snapshot.redriveId,
      };
    });
  }

  async requestRedrive(request: RedriveRequest): Promise<RedriveRecord> {
    const currentState = await this.getJobState(request.jobId);
    if (!currentState) {
      throw new Error(`Cannot request redrive for unknown job: ${request.jobId}`);
    }
    if (currentState.state !== "dead_letter") {
      throw new Error(`Can only redrive dead-letter jobs. Current state: ${currentState.state}`);
    }

    const redriveId = request.redriveId ?? createRedriveId();
    const requestedAt = request.requestedAt ?? new Date().toISOString();
    const event: QueueJobEvent = {
      eventId: `evt_${redriveId}`,
      type: "redrive_requested",
      occurredAt: requestedAt,
      requestedAt,
      requestedBy: request.requestedBy,
      reason: request.reason,
      redriveId,
      jobId: currentState.jobId,
      jobName: currentState.jobName,
      queueName: currentState.queueName,
      attempt: currentState.attempt,
      createdAt: currentState.createdAt,
      scheduledAt: request.scheduledAt ?? requestedAt,
      payload: currentState.payload,
      queue: currentState.queue,
      headers: currentState.headers,
      dispatchKind: "redrive",
    };

    await this.append([event]);

    return {
      jobId: currentState.jobId,
      redriveId,
      queueName: currentState.queueName,
      jobName: currentState.jobName,
      requestedAt,
      requestedBy: request.requestedBy,
      reason: request.reason,
    };
  }

  private async execute(sql: string): Promise<void> {
    const response = await this.fetchImpl(this.buildUrl(sql), {
      method: "POST",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`ClickHouse query failed (${response.status}): ${await response.text()}`);
    }
  }

  private async insertJsonEachRow(table: string, rows: object[]): Promise<void> {
    const response = await this.fetchImpl(this.buildUrl(`INSERT INTO ${table} FORMAT ${JSON_FORMAT}`), {
      method: "POST",
      headers: {
        ...this.buildHeaders(),
        "content-type": "application/x-ndjson",
      },
      body: `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    });

    if (!response.ok) {
      throw new Error(`ClickHouse insert failed (${response.status}): ${await response.text()}`);
    }
  }

  private async queryRows<T>(sql: string): Promise<T[]> {
    const response = await this.fetchImpl(this.buildUrl(sql), {
      method: "POST",
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      throw new Error(`ClickHouse query failed (${response.status}): ${await response.text()}`);
    }

    const text = await response.text();
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }

  private buildUrl(query: string): string {
    const url = new URL(this.options.url);
    if (this.database) {
      url.searchParams.set("database", this.database);
    }
    url.searchParams.set("query", query);
    return url.toString();
  }

  private buildHeaders(): HeadersInit {
    return this.authHeader ? { Authorization: this.authHeader } : {};
  }

  private toEventRow(event: QueueJobEvent): ClickHouseEventRow {
    return {
      event_id: event.eventId,
      event_type: event.type,
      event_time: event.occurredAt,
      created_at: event.createdAt,
      job_id: event.jobId,
      job_name: event.jobName,
      queue_name: event.queueName,
      attempt: event.attempt,
      state: this.resolveState(event),
      scheduled_at: this.resolveScheduledAt(event),
      dispatch_kind: event.dispatchKind,
      redrive_id: event.redriveId ?? null,
      payload_json: JSON.stringify(event.payload),
      queue_json: JSON.stringify(event.queue),
      headers_json: JSON.stringify(event.headers),
      error_json: JSON.stringify("error" in event ? event.error : null),
      dead_letter_reason_json: JSON.stringify("reason" in event ? event.reason : null),
      requested_by: event.type === "redrive_requested" ? event.requestedBy : null,
      requested_reason: event.type === "redrive_requested" ? event.reason ?? null : null,
    };
  }

  private toCurrentRow(event: QueueJobEvent): ClickHouseCurrentRow {
    return {
      job_id: event.jobId,
      queue_name: event.queueName,
      job_name: event.jobName,
      created_at: event.createdAt,
      updated_at: event.occurredAt,
      state: this.resolveState(event),
      attempt: this.resolveAttempt(event),
      scheduled_at: this.resolveScheduledAt(event),
      dispatch_kind: event.dispatchKind,
      redrive_id: event.redriveId ?? null,
      payload_json: JSON.stringify(event.payload),
      queue_json: JSON.stringify(event.queue),
      headers_json: JSON.stringify(event.headers),
      error_json: JSON.stringify("error" in event ? event.error : null),
      dead_letter_reason_json: JSON.stringify("reason" in event ? event.reason : null),
    };
  }

  private fromEventRow(row: ClickHouseEventRow): QueueJobEvent {
    const common = {
      eventId: row.event_id,
      occurredAt: row.event_time,
      createdAt: row.created_at,
      jobId: row.job_id,
      jobName: row.job_name,
      queueName: row.queue_name,
      attempt: row.attempt,
      scheduledAt: row.scheduled_at ?? undefined,
      redriveId: row.redrive_id ?? undefined,
      payload: JSON.parse(row.payload_json),
      queue: JSON.parse(row.queue_json),
      headers: JSON.parse(row.headers_json),
      dispatchKind: row.dispatch_kind as QueueJobEvent["dispatchKind"],
    };

    switch (row.event_type) {
      case "job_enqueued":
        return { ...common, type: "job_enqueued" };
      case "attempt_started":
        return { ...common, type: "attempt_started" };
      case "attempt_succeeded":
        return { ...common, type: "attempt_succeeded" };
      case "attempt_failed":
        return {
          ...common,
          type: "attempt_failed",
          error: JSON.parse(row.error_json),
        };
      case "retry_scheduled":
        return {
          ...common,
          type: "retry_scheduled",
          error: JSON.parse(row.error_json),
          nextAttempt: row.attempt,
          retryAt: row.scheduled_at ?? row.event_time,
        };
      case "moved_to_dlq":
        return {
          ...common,
          type: "moved_to_dlq",
          error: JSON.parse(row.error_json),
          reason: JSON.parse(row.dead_letter_reason_json),
        };
      case "redrive_requested":
        return {
          ...common,
          type: "redrive_requested",
          redriveId: row.redrive_id ?? "",
          requestedAt: row.event_time,
          requestedBy: row.requested_by ?? "unknown",
          reason: row.requested_reason ?? undefined,
        };
      case "redrive_dispatched":
        return {
          ...common,
          type: "redrive_dispatched",
          redriveId: row.redrive_id ?? "",
        };
    }
  }

  private fromCurrentRow(row: ClickHouseCurrentRow): QueueJobStateSnapshot {
    const queue = JSON.parse(row.queue_json);
    const headers = JSON.parse(row.headers_json);
    return {
      jobId: row.job_id,
      jobName: row.job_name,
      queueName: row.queue_name,
      state: row.state as QueueJobStateSnapshot["state"],
      attempt: row.attempt,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      scheduledAt: row.scheduled_at ?? undefined,
      redriveId: row.redrive_id ?? undefined,
      payload: JSON.parse(row.payload_json),
      queue,
      headers,
      dispatchKind: row.dispatch_kind as QueueJobStateSnapshot["dispatchKind"],
      lastError: JSON.parse(row.error_json),
      deadLetterReason: JSON.parse(row.dead_letter_reason_json),
    };
  }

  private resolveAttempt(event: QueueJobEvent): number {
    if (event.type === "retry_scheduled") {
      return event.nextAttempt;
    }
    return event.attempt;
  }

  private resolveScheduledAt(event: QueueJobEvent): string | null {
    if (event.type === "retry_scheduled") return event.retryAt;
    if (event.type === "redrive_requested") return event.scheduledAt ?? event.requestedAt;
    return event.scheduledAt ?? null;
  }

  private resolveState(event: QueueJobEvent): QueueJobStateSnapshot["state"] {
    const snapshot = reduceQueueJobEvent(null, event);
    return snapshot.state;
  }

  private escapeString(value: string): string {
    return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
  }
}

export function createClickHouseStorage(options: ClickHouseStorageOptions): Storage {
  return new ClickHouseStorage(options);
}

function reduceRedriveRows(rows: ClickHouseRedriveRow[]): RedriveRecord[] {
  const records = new Map<string, RedriveRecord>();

  for (const row of rows) {
    const existing = records.get(row.redrive_id) ?? {
      jobId: row.job_id,
      redriveId: row.redrive_id,
      queueName: row.queue_name,
      jobName: row.job_name,
      requestedAt: row.event_time,
      requestedBy: row.requested_by ?? "unknown",
      reason: row.requested_reason ?? undefined,
    };

    if (row.event_type === "redrive_requested") {
      existing.requestedAt = row.event_time;
      existing.requestedBy = row.requested_by ?? existing.requestedBy;
      existing.reason = row.requested_reason ?? existing.reason;
    } else {
      existing.dispatchedAt = row.event_time;
    }

    records.set(row.redrive_id, existing);
  }

  return [...records.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}
