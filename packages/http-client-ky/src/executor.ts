import ky, { type KyInstance, type Options as KyOptions, type KyResponse } from "ky";
import type { HttpExecutor, ExecuteRequest, ExecuteResponse } from "@alt-stack/http-client-core";
import { TimeoutError, UnexpectedApiClientError } from "@alt-stack/http-client-core";

export interface KyExecutorOptions {
  /**
   * Use a custom ky instance.
   * Useful for pre-configured ky instances with hooks, defaults, etc.
   */
  ky?: KyInstance;
  /**
   * Additional ky options to pass to every request.
   * These are merged with the request-specific options.
   */
  kyOptions?: Omit<KyOptions, "method" | "headers" | "body" | "timeout" | "signal">;
}

/**
 * HTTP executor using ky library.
 * Exposes the raw KyResponse object for advanced use cases.
 */
export class KyExecutor implements HttpExecutor<KyResponse> {
  private readonly kyInstance: KyInstance;
  private readonly kyOptions: KyExecutorOptions["kyOptions"];

  constructor(options: KyExecutorOptions = {}) {
    this.kyInstance = options.ky ?? ky;
    this.kyOptions = options.kyOptions;
  }

  async execute(request: ExecuteRequest): Promise<ExecuteResponse<KyResponse>> {
    try {
      const response = await this.kyInstance(request.url, {
        ...this.kyOptions,
        method: request.method,
        headers: request.headers,
        body: request.body,
        timeout: request.timeout === undefined ? false : request.timeout,
        throwHttpErrors: false, // Handle errors ourselves
      });

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
      // Handle ky timeout errors
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new TimeoutError(request.timeout ?? 0, request.url, request.method, error);
      }
      // Handle abort errors (manual timeout via AbortController)
      if (error instanceof Error && error.name === "AbortError") {
        throw new TimeoutError(request.timeout ?? 0, request.url, request.method, error);
      }
      throw new UnexpectedApiClientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        request.url,
        request.method,
        error,
      );
    }
  }
}

