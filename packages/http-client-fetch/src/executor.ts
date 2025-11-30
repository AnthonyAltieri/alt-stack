import type { HttpExecutor, ExecuteRequest, ExecuteResponse } from "@alt-stack/http-client-core";
import { TimeoutError, UnexpectedApiClientError } from "@alt-stack/http-client-core";

export interface FetchExecutorOptions {
  /**
   * Additional fetch options to pass to every request.
   * These are merged with the request-specific options.
   */
  fetchOptions?: Omit<RequestInit, "method" | "headers" | "body" | "signal">;
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

      const response = await fetch(request.url, fetchOptions);

      let data: unknown;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        data,
        raw: response,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(request.timeout!, request.url, request.method, error);
      }
      throw new UnexpectedApiClientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        request.url,
        request.method,
        error,
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}

