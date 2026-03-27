import { describe, expect, it, vi } from "vitest";
import { ClickHouseStorage } from "./storage.js";

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

    expect(fetchMock).toHaveBeenCalledTimes(2);
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
