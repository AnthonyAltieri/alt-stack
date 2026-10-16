# @alt-stack/http-client-core

## 1.8.0

### Minor Changes

- 4438628: Add an optional fetch implementation to the Fetch client and executor, and support synchronous or asynchronous client header providers in core and both adapters. Providers resolve once per attempt before request headers are applied, including core retries, and failures use a sanitized unexpected error.

## 1.7.0

## 1.6.3

## 1.6.2

## 1.6.1

### Patch Changes

- 7867f92: Accept Zod input values for generated request params, query, and bodies, then encode validated outputs consistently before transport.

## 1.6.0

## 1.5.1

## 1.5.0

## 1.4.0
