import { describe, expect, it, vi } from "vitest";
import { ClickHouseStorage } from "./storage.js";
import { buildSchemaStatements, getTableNames } from "./sql.js";

function createResponse(body: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    text: async () => body,
  } as Response;
}

describe("ClickHouseStorage", () => {
  it("ensures the schema by issuing the table statements", async () => {
    const fetchMock = vi.fn(async () => createResponse(""));
    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    await storage.ensureSchema();

    expect(fetchMock).toHaveBeenCalledTimes(
      buildSchemaStatements(getTableNames()).length,
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown];
    expect(String(firstCall[0])).toContain("CREATE+TABLE");
  });

  it("appends queue events to the events and current tables", async () => {
    const fetchMock = vi.fn(async () => createResponse(""));
    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    await storage.append([
      {
        eventId: "evt_1",
        type: "job_enqueued",
        occurredAt: "2026-03-27T12:00:00.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId: "job_1",
        jobName: "process-upload",
        queueName: "uploads",
        attempt: 1,
        payload: { fileId: "file_1" },
        queue: { name: "uploads" },
        headers: { "x-created-at": "2026-03-27T12:00:00.000Z" },
        dispatchKind: "initial",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstInsertCall = fetchMock.mock.calls[0] as unknown as [unknown, { body?: string }];
    const secondInsertCall = fetchMock.mock.calls[1] as unknown as [unknown];
    const firstBody = String(firstInsertCall[1]?.body);
    expect(firstBody).toContain("\"event_type\":\"job_enqueued\"");
    const secondUrl = String(secondInsertCall[0]);
    expect(secondUrl).toContain("queue_state_current");
  });

  it("round-trips retry_scheduled nextAttempt from event rows", async () => {
    const fetchMock = vi.fn(async () =>
      createResponse(
        [
          {
            event_id: "evt_1",
            event_type: "job_enqueued",
            event_time: "2026-03-27T12:00:00.000Z",
            created_at: "2026-03-27T12:00:00.000Z",
            job_id: "job_1",
            job_name: "process-upload",
            queue_name: "uploads",
            attempt: 1,
            next_attempt: null,
            state: "queued",
            scheduled_at: null,
            dispatch_kind: "initial",
            redrive_id: null,
            partition_key: "tenant-1",
            payload_json: "{\"fileId\":\"file_1\"}",
            queue_json: "{\"name\":\"uploads\"}",
            headers_json: "{\"x-created-at\":\"1711540800000\"}",
            error_json: "null",
            dead_letter_reason_json: "null",
            requested_by: null,
            requested_reason: null,
          },
          {
            event_id: "evt_2",
            event_type: "retry_scheduled",
            event_time: "2026-03-27T12:00:01.000Z",
            created_at: "2026-03-27T12:00:00.000Z",
            job_id: "job_1",
            job_name: "process-upload",
            queue_name: "uploads",
            attempt: 1,
            next_attempt: 2,
            state: "retry_scheduled",
            scheduled_at: "2026-03-27T12:00:05.000Z",
            dispatch_kind: "retry",
            redrive_id: null,
            partition_key: "tenant-1",
            payload_json: "{\"fileId\":\"file_1\"}",
            queue_json: "{\"name\":\"uploads\",\"retry\":{\"maxRetries\":1,\"delay\":{\"type\":\"fixed\",\"ms\":1000}}}",
            headers_json: "{\"x-created-at\":\"1711540800000\"}",
            error_json: "{\"name\":\"Error\",\"message\":\"boom\"}",
            dead_letter_reason_json: "null",
            requested_by: null,
            requested_reason: null,
          },
        ]
          .map((row) => JSON.stringify(row))
          .join("\n"),
      ),
    );
    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    const history = await storage.getJob("job_1");
    const retryEvent = history?.events[1];

    expect(retryEvent?.type).toBe("retry_scheduled");
    expect(retryEvent && "nextAttempt" in retryEvent ? retryEvent.nextAttempt : null).toBe(2);
    expect(history?.state?.attempt).toBe(2);
  });

  it("keeps partition keys in due dispatch snapshots", async () => {
    const fetchMock = vi.fn(async () =>
      createResponse(
        JSON.stringify({
          job_id: "job_1",
          queue_name: "uploads",
          job_name: "process-upload",
          created_at: "2026-03-27T12:00:00.000Z",
          updated_at: "2026-03-27T12:00:05.000Z",
          state: "retry_scheduled",
          attempt: 2,
          scheduled_at: "2026-03-27T12:00:05.000Z",
          dispatch_kind: "retry",
          redrive_id: null,
          partition_key: "tenant-1",
          payload_json: "{\"fileId\":\"file_1\"}",
          queue_json: "{\"name\":\"uploads\",\"retry\":{\"maxRetries\":1,\"delay\":{\"type\":\"fixed\",\"ms\":1000}}}",
          headers_json: "{\"x-created-at\":\"1711540800000\"}",
          error_json: "{\"name\":\"Error\",\"message\":\"boom\"}",
          dead_letter_reason_json: "null",
        }),
      ),
    );
    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    const dueDispatches = await storage.listDueDispatches();

    expect(dueDispatches).toHaveLength(1);
    expect(dueDispatches[0]?.key).toBe("tenant-1");
  });

  it("does not serialize redrive request text into dead-letter reason fields", async () => {
    const fetchMock = vi.fn(async () => createResponse(""));
    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    await storage.append([
      {
        eventId: "evt_redrive_1",
        type: "redrive_requested",
        occurredAt: "2026-03-27T12:00:10.000Z",
        requestedAt: "2026-03-27T12:00:10.000Z",
        requestedBy: "operator@example.com",
        reason: "manual replay",
        redriveId: "redrive_1",
        jobId: "job_1",
        jobName: "process-upload",
        queueName: "uploads",
        attempt: 2,
        createdAt: "2026-03-27T12:00:00.000Z",
        scheduledAt: "2026-03-27T12:01:00.000Z",
        payload: { fileId: "file_1" },
        queue: { name: "uploads" },
        headers: { "x-created-at": "2026-03-27T12:00:00.000Z" },
        key: "tenant-1",
        dispatchKind: "redrive",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const eventsBody = String(
      (fetchMock.mock.calls[0] as unknown as [unknown, { body?: string }])[1]?.body,
    );
    const currentBody = String(
      (fetchMock.mock.calls[1] as unknown as [unknown, { body?: string }])[1]?.body,
    );

    expect(eventsBody).toContain("\"requested_reason\":\"manual replay\"");
    expect(eventsBody).toContain("\"dead_letter_reason_json\":\"null\"");
    expect(currentBody).toContain("\"dead_letter_reason_json\":\"null\"");
  });

  it("requests a redrive using the current dead-letter snapshot", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(
          "{\"job_id\":\"job_1\",\"queue_name\":\"uploads\",\"job_name\":\"process-upload\",\"created_at\":\"2026-03-27T12:00:00.000Z\",\"updated_at\":\"2026-03-27T12:00:00.000Z\",\"state\":\"dead_letter\",\"attempt\":3,\"scheduled_at\":null,\"dispatch_kind\":\"retry\",\"redrive_id\":null,\"payload_json\":\"{\\\"fileId\\\":\\\"file_1\\\"}\",\"queue_json\":\"{\\\"name\\\":\\\"uploads\\\",\\\"deadLetter\\\":{\\\"queueName\\\":\\\"uploads-dlq\\\"}}\",\"headers_json\":\"{\\\"x-created-at\\\":\\\"1711540800000\\\"}\",\"error_json\":\"null\",\"dead_letter_reason_json\":\"{\\\"code\\\":\\\"max_retries_exceeded\\\",\\\"message\\\":\\\"boom\\\"}\"}\n",
        ),
      )
      .mockResolvedValueOnce(createResponse(""))
      .mockResolvedValueOnce(createResponse(""));

    const storage = new ClickHouseStorage({
      url: "http://localhost:8123",
      fetch: fetchMock,
    });

    const record = await storage.requestRedrive({
      jobId: "job_1",
      requestedBy: "operator@example.com",
      reason: "manual replay",
      redriveId: "redrive_1",
    });

    expect(record.redriveId).toBe("redrive_1");
    expect(record.requestedBy).toBe("operator@example.com");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
