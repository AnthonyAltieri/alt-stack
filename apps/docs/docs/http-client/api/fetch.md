# Fetch HTTP client API Documentation

`@alt-stack/http-client-fetch` binds the core client to the standard Fetch API and exposes native `Response` objects as `result.raw`.

```bash
pnpm add @alt-stack/http-client-fetch zod
```

Use a runtime with `fetch`, `Response`, `Headers`, and `AbortController` globals. In this repository that means Node.js 18 or newer; modern browsers and Bun also provide these APIs.

## `createApiClient`

```typescript
function createApiClient<
  TRequest extends ApiRequestSchema,
  TResponse extends ApiResponseSchema,
>(options: FetchClientOptions<TRequest, TResponse>): FetchApiClient<TRequest, TResponse>;
```

Creates a `FetchExecutor`, then constructs the core `ApiClient`. `FetchApiClient<TRequest, TResponse>` is an alias for `ApiClient<TRequest, TResponse, Response>`.

### `FetchClientOptions`

| Property | Type | Required |
| --- | --- | --- |
| `baseUrl` | `string` | yes |
| `Request` | `TRequest` | yes |
| `Response` | `TResponse` | yes |
| `headers` | `Record<string, unknown>` | no |
| `fetchOptions` | `FetchExecutorOptions["fetchOptions"]` | no |
| `onValidationError` | `ApiClientValidationErrorHandler<Response>` | no |
| `logger` | `Logger` | no |

See the [core API](./core.md) for shared request, response, retry, validation, logging, and error behavior.

## `FetchExecutor`

```typescript
class FetchExecutor implements HttpExecutor<Response> {
  constructor(options?: FetchExecutorOptions);
  execute(request: ExecuteRequest): Promise<ExecuteResponse<Response>>;
}
```

`FetchExecutorOptions` has one optional property:

```typescript
interface FetchExecutorOptions {
  fetchOptions?: Omit<RequestInit, "method" | "headers" | "body" | "signal">;
}
```

The executor spreads `fetchOptions` first. It then owns `method`, `headers`, `signal`, and an optional `body`, so callers cannot override those fields through adapter-wide options. Useful forwarded options include `credentials`, `cache`, `mode`, `redirect`, `referrer`, and `keepalive` where the runtime supports them.

### Response decoding

- `content-length: 0` becomes `null` without reading the body.
- A content type containing `application/json` is decoded with `response.json()`.
- If JSON decoding throws, the executor then calls `response.text()`.
- Every other content type is returned as text.

The raw native `Response` is returned alongside decoded `data`. Because body readers consume the stream, callers should not assume `result.raw.json()` or `.text()` remains usable; headers, status, URL, and other metadata remain available.

### Timeouts and errors

When `ExecuteRequest.timeout` is defined, the executor creates an `AbortController` and aborts after that many milliseconds. An `AbortError` becomes `TimeoutError(timeout, url, method, cause)`. Every other thrown value becomes `UnexpectedApiClientError` with message `Network error: ...` and the original value as `cause`. The timer is cleared in `finally`.

A caller-supplied signal cannot be passed through `fetchOptions`; the executor reserves `signal` for timeout handling.

## Exports

Adapter-specific exports are `createApiClient`, `FetchClientOptions`, `FetchApiClient`, `FetchExecutor`, and `FetchExecutorOptions`.

The package also re-exports all public core values and types: `ApiClient`, `HTTP_CLIENT_DEBUG_NAMESPACE`, `ApiClientError`, `UnexpectedApiClientError`, `ValidationError`, `TimeoutError`, `ApiClientOptions`, `ApiClientValidationErrorLocation`, `ApiClientValidationErrorContext`, `ApiClientValidationErrorHandler`, `ApiRequestSchema`, `ApiResponseSchema`, `LogLevel`, `LogMeta`, `LogHandler`, `Logger`, `ApiClientLoggingOptions`, `HttpExecutor`, `ExecuteRequest`, `ExecuteResponse`, `ExtractPathParams`, `ExtractRequestParams`, `ExtractRequestQuery`, `ExtractRequestBody`, `ParamsRequired`, `BodyRequired`, `EndpointsWithMethod`, `RequestOptions`, `RetryContext`, `ExtractStatusCodes`, `ExtractSuccessCodes`, `ExtractErrorCodes`, `ExtractResponseSchema`, `ExtractSuccessBody`, `SuccessResponse`, `ErrorResponse`, `UnexpectedErrorResponse`, and `ApiResponse`.
