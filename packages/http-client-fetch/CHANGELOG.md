# @alt-stack/http-client-fetch

## 1.8.1

### Patch Changes

- f1b8b19: Preserve branded path parameter types and content-free 2xx responses in generated TypeScript SDKs. Branded path fields now require parsed branded identifiers; query, body and unbranded codec inputs keep their existing input semantics.

  Generate `z.undefined()` for content-free successes and return `undefined` for empty bodies in both HTTP adapters. Existing schemas that used `z.null()` for empty responses must switch to `z.undefined()`; JSON `null` is unchanged.

  Return an unexpected-error result for every undeclared status, including 2xx, with its numeric status and raw response. Declare all expected successes; there is no permissive mode.

  Sanitize network failures to `Network request failed` and discard original transport exceptions and request URLs, including timeout causes, so messages, serialization and internal logs cannot expose their contents. Original transport errors are no longer available programmatically.

  These packages release together through the repository's existing fixed version group.

- Updated dependencies [f1b8b19]
  - @alt-stack/http-client-core@1.8.1

## 1.8.0

### Minor Changes

- 4438628: Add an optional fetch implementation to the Fetch client and executor, and support synchronous or asynchronous client header providers in core and both adapters. Providers resolve once per attempt before request headers are applied, including core retries, and failures use a sanitized unexpected error.

### Patch Changes

- Updated dependencies [4438628]
  - @alt-stack/http-client-core@1.8.0

## 1.7.0

### Patch Changes

- @alt-stack/http-client-core@1.7.0

## 1.6.3

### Patch Changes

- @alt-stack/http-client-core@1.6.3

## 1.6.2

### Patch Changes

- @alt-stack/http-client-core@1.6.2

## 1.6.1

### Patch Changes

- 7867f92: Accept Zod input values for generated request params, query, and bodies, then encode validated outputs consistently before transport.
- Updated dependencies [7867f92]
  - @alt-stack/http-client-core@1.6.1

## 1.6.0

### Patch Changes

- @alt-stack/http-client-core@1.6.0

## 1.5.1

### Patch Changes

- @alt-stack/http-client-core@1.5.1

## 1.5.0

### Patch Changes

- @alt-stack/http-client-core@1.5.0

## 1.4.0

### Patch Changes

- @alt-stack/http-client-core@1.4.0
