import type { HttpExecutor, ExecuteRequest, ExecuteResponse } from "@alt-stack/http-client-core";
import { TimeoutError, UnexpectedApiClientError } from "@alt-stack/http-client-core";

export interface FetchExecutorOptions {
  /** Fetch implementation. Defaults to globalThis.fetch at execution time. */
  fetch?: typeof globalThis.fetch;
  /**
   * Additional fetch options to pass to every request.
   * These are merged with the request-specific options.
   */
  fetchOptions?: Omit<RequestInit, "method" | "headers" | "body" | "signal">;
}

async function parseResponseData(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205 || response.headers.get("content-length")?.trim() === "0") {
    return undefined;
  }
  const text = await response.text();
  if (text === "") return undefined;
  if (response.headers.get("content-type")?.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * HTTP executor using native fetch API.
 * Exposes the raw Response object for advanced use cases.
 */
export class FetchExecutor implements HttpExecutor<Response> {
  constructor(private readonly options: FetchExecutorOptions = {}) {}

  async execute(request: ExecuteRequest): Promise<ExecuteResponse<Response>> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (request.timeout !== undefined) {
      timeoutId = setTimeout(() => controller.abort(), request.timeout);
    }

    try {
      const fetchOptions: RequestInit = {
        ...this.options.fetchOptions,
        method: request.method,
        headers: request.headers,
        signal: controller.signal,
      };

      if (request.body !== undefined) {
        fetchOptions.body = request.body;
      }

      const fetch = this.options.fetch ?? globalThis.fetch;
      const response = await fetch(request.url, fetchOptions);
      const data = await parseResponseData(response);

      return {
        status: response.status,
        statusText: response.statusText,
        data,
        raw: response,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(request.timeout ?? 0, undefined, request.method);
      }
      throw new UnexpectedApiClientError(
        "Network request failed",
        undefined,
        undefined,
        request.method,
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
