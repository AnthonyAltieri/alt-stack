# Ky HTTP client API Documentation

`@alt-stack/http-client-ky` binds the core client to [Ky](https://github.com/sindresorhus/ky). Use it when an application already standardizes on Ky instances, hooks, or options.

```bash
pnpm add @alt-stack/http-client-ky zod
```

Ky is a direct dependency of the adapter. The selected runtime must satisfy Ky's own Fetch-platform requirements.

## `createApiClient`

```typescript
function createApiClient<
  TRequest extends ApiRequestSchema,
  TResponse extends ApiResponseSchema,
>(options: KyClientOptions<TRequest, TResponse>): KyApiClient<TRequest, TResponse>;
```

Creates a `KyExecutor`, then constructs the core `ApiClient`. `KyApiClient<TRequest, TResponse>` is an alias for `ApiClient<TRequest, TResponse, KyResponse>`.

### `KyClientOptions`

| Property | Type | Required |
| --- | --- | --- |
| `baseUrl` | `string` | yes |
| `Request` | `TRequest` | yes |
| `Response` | `TResponse` | yes |
| `headers` | `Record<string, unknown>` | no |
| `ky` | `KyInstance` | no |
| `kyOptions` | `KyExecutorOptions["kyOptions"]` | no |
| `onValidationError` | `ApiClientValidationErrorHandler<KyResponse>` | no |
| `logger` | `Logger` | no |

Pass either the default Ky function or a preconfigured instance:

```typescript
import ky from "ky";
import { createApiClient } from "@alt-stack/http-client-ky";
import { Request, Response } from "./generated-api.js";

const transport = ky.create({
  hooks: {
    beforeRequest: [(request) => request.headers.set("X-App", "dashboard")],
  },
});

const api = createApiClient({
  baseUrl: "https://api.example.test",
  Request,
  Response,
  ky: transport,
});
```

See the [core API](./core.md) for shared request, response, retry, validation, logging, and error behavior.

## `KyExecutor`

```typescript
class KyExecutor implements HttpExecutor<KyResponse> {
  constructor(options?: KyExecutorOptions);
  execute(request: ExecuteRequest): Promise<ExecuteResponse<KyResponse>>;
}
```

`KyExecutorOptions` is:

```typescript
interface KyExecutorOptions {
  ky?: KyInstance;
  kyOptions?: Omit<KyOptions, "method" | "headers" | "body" | "timeout" | "signal">;
}
```

The executor spreads `kyOptions` first and then controls `method`, `headers`, `body`, `timeout`, and `throwHttpErrors`. `throwHttpErrors` is always `false` so documented 4xx/5xx responses reach the core response union. When no request timeout is supplied, Ky receives `timeout: false`; otherwise it receives the millisecond value.

Be careful with `prefixUrl`: the core passes an already-concatenated URL (`baseUrl + endpoint`) to Ky, so Ky's restrictions and URL behavior still apply.

### Response decoding

Content types containing `application/json` use `response.json()` and fall back to `response.text()` if parsing throws. All other content types use text. Unlike the Fetch executor, there is no special `content-length: 0` branch; an empty body therefore becomes an empty string through the text path. `result.raw` is the `KyResponse`, whose body stream has already been consumed by decoding.

### Timeouts and errors

An error named `TimeoutError` or `AbortError` becomes the core `TimeoutError`. All other thrown values become `UnexpectedApiClientError` with a `Network error: ...` message and the original value as `cause`.

Ky may have its own retry configuration in `kyOptions`, and the Altstack core separately supports `RequestOptions.retries`. Enabling both creates two retry layers; choose one policy deliberately to avoid multiplying attempts.

## Ky type exports

For convenience the adapter exports Ky's `KyInstance`, `Options` as `KyOptions`, and `KyResponse` types.

## Exports

Adapter-specific exports are `createApiClient`, `KyClientOptions`, `KyApiClient`, `KyInstance`, `KyOptions`, `KyResponse`, `KyExecutor`, and `KyExecutorOptions`.

The package also re-exports all public core values and types: `ApiClient`, `HTTP_CLIENT_DEBUG_NAMESPACE`, `ApiClientError`, `UnexpectedApiClientError`, `ValidationError`, `TimeoutError`, `ApiClientOptions`, `ApiClientValidationErrorLocation`, `ApiClientValidationErrorContext`, `ApiClientValidationErrorHandler`, `ApiRequestSchema`, `ApiResponseSchema`, `LogLevel`, `LogMeta`, `LogHandler`, `Logger`, `ApiClientLoggingOptions`, `HttpExecutor`, `ExecuteRequest`, `ExecuteResponse`, `ExtractPathParams`, `ExtractRequestParams`, `ExtractRequestQuery`, `ExtractRequestBody`, `ParamsRequired`, `BodyRequired`, `EndpointsWithMethod`, `RequestOptions`, `RetryContext`, `ExtractStatusCodes`, `ExtractSuccessCodes`, `ExtractErrorCodes`, `ExtractResponseSchema`, `ExtractSuccessBody`, `SuccessResponse`, `ErrorResponse`, `UnexpectedErrorResponse`, and `ApiResponse`.
