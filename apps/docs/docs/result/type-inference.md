# Type Inference

Extract and narrow error types with `InferErrorTag`, `InferErrorTags`, `NarrowError`, `isResultError()`, and `assertResultError()`.

## InferErrorTag

Extract the `_tag` literal type from a single error class:

```typescript
import { type InferErrorTag, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly id: string) {
    super(`Not found: ${id}`);
  }
}

type Tag = InferErrorTag<NotFoundError>;
// "NotFoundError"
```

### Type Signature

```typescript
type InferErrorTag<E extends ResultError> = E["_tag"];
```

### Use Cases

**Type-safe error codes:**

```typescript
function logError<E extends ResultError>(error: E) {
  const tag: InferErrorTag<E> = error._tag;
  logger.error(`Error [${tag}]: ${error.message}`);
}
```

**Generic error handlers:**

```typescript
function createErrorHandler<E extends ResultError>() {
  return (error: E): { code: InferErrorTag<E>; message: string } => ({
    code: error._tag,
    message: error.message,
  });
}
```

## InferErrorTags

Extract all `_tag` values from a union of error types:

```typescript
import { type InferErrorTags, TaggedError } from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(message: string) {
    super(message);
  }
}

class ValidationError extends TaggedError {
  readonly _tag = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}

class DatabaseError extends TaggedError {
  readonly _tag = "DatabaseError";
  constructor(message: string) {
    super(message);
  }
}

type AllErrors = NotFoundError | ValidationError | DatabaseError;
type AllTags = InferErrorTags<AllErrors>;
// "NotFoundError" | "ValidationError" | "DatabaseError"
```

### Type Signature

```typescript
type InferErrorTags<E extends ResultError> = E extends ResultError
  ? E["_tag"]
  : never;
```

### Use Cases

**Exhaustive type checking:**

```typescript
function handleAllErrors(tag: InferErrorTags<AllErrors>) {
  switch (tag) {
    case "NotFoundError":
      return 404;
    case "ValidationError":
      return 400;
    case "DatabaseError":
      return 500;
  }
}
```

**Error code constants:**

```typescript
const ERROR_CODES: Record<InferErrorTags<AllErrors>, number> = {
  NotFoundError: 404,
  ValidationError: 400,
  DatabaseError: 500,
};
```

## NarrowError

Narrow an error union to a specific error type by its `_tag`:

```typescript
import { type NarrowError, TaggedError } from "@alt-stack/result";

type AllErrors = NotFoundError | ValidationError | DatabaseError;

type OnlyNotFound = NarrowError<AllErrors, "NotFoundError">;
// NotFoundError

type OnlyValidation = NarrowError<AllErrors, "ValidationError">;
// ValidationError
```

### Type Signature

```typescript
type NarrowError<E extends ResultError, Tag extends string> = Extract<
  E,
  { _tag: Tag }
>;
```

### Use Cases

**Specific error handlers:**

```typescript
function handleNotFound(error: NarrowError<AllErrors, "NotFoundError">) {
  // error is typed as NotFoundError
  console.log(`Resource ${error.id} not found`);
}
```

**Conditional error handling:**

```typescript
function handleError<E extends AllErrors>(error: E) {
  if (error._tag === "NotFoundError") {
    // TypeScript narrows to NotFoundError
    const notFound: NarrowError<E, "NotFoundError"> = error;
    return { status: 404, id: notFound.id };
  }
  // Handle other errors...
}
```

## isResultError()

Runtime check if a value satisfies the `ResultError` type:

```typescript
import { isResultError, TaggedError } from "@alt-stack/result";

class MyError extends TaggedError {
  readonly _tag = "MyError";
  constructor(message: string) {
    super(message);
  }
}

const error = new MyError("Something went wrong");
const plainError = new Error("Plain error");

isResultError(error);      // true
isResultError(plainError); // false (no _tag)
isResultError("string");   // false (not an Error)
isResultError(null);       // false
```

### Type Signature

```typescript
function isResultError(error: unknown): error is ResultError;
```

### Use Cases

**Catching and wrapping:**

```typescript
try {
  await riskyOperation();
} catch (error) {
  if (isResultError(error)) {
    // error has _tag, safe to use with Result
    return err(error);
  }
  // Wrap unknown errors
  return err(new UnknownError(error));
}
```

**Type narrowing in generic code:**

```typescript
function processError(error: unknown) {
  if (isResultError(error)) {
    // TypeScript knows error is ResultError
    console.log(`Tagged error: ${error._tag}`);
    return error;
  }

  if (error instanceof Error) {
    return new WrappedError(error);
  }

  return new UnknownError(String(error));
}
```

## assertResultError()

Runtime assertion that throws if the value is not a `ResultError`:

```typescript
import { assertResultError, TaggedError } from "@alt-stack/result";

class MyError extends TaggedError {
  readonly _tag = "MyError";
  constructor(message: string) {
    super(message);
  }
}

const error = new MyError("test");
assertResultError(error);
// error is now typed as ResultError

const plainError = new Error("plain");
assertResultError(plainError);
// Throws: "Expected a ResultError with a _tag property, got: Error"
```

### Type Signature

```typescript
function assertResultError(error: unknown): asserts error is ResultError;
```

### Use Cases

**Validating error types:**

```typescript
function ensureResultError(error: unknown): ResultError {
  assertResultError(error);
  return error;
}
```

**Test assertions:**

```typescript
test("should return a ResultError", () => {
  const result = err(new NotFoundError("123"));
  if (isErr(result)) {
    assertResultError(result.error);
    expect(result.error._tag).toBe("NotFoundError");
  }
});
```

**Runtime validation:**

```typescript
async function handleThrown(thrown: unknown): Promise<ResultError> {
  try {
    assertResultError(thrown);
    return thrown;
  } catch {
    return new UnknownError(thrown);
  }
}
```

## Combining Type Utilities

```typescript
import {
  type Result,
  type InferErrorTags,
  type NarrowError,
  isErr,
  TaggedError,
} from "@alt-stack/result";

class NotFoundError extends TaggedError {
  readonly _tag = "NotFoundError";
  constructor(public readonly resourceId: string) {
    super(`Resource ${resourceId} not found`);
  }
}

class PermissionError extends TaggedError {
  readonly _tag = "PermissionError";
  constructor(public readonly action: string) {
    super(`Not allowed: ${action}`);
  }
}

type ApiError = NotFoundError | PermissionError;

// Get all possible error tags
type ApiErrorTags = InferErrorTags<ApiError>;
// "NotFoundError" | "PermissionError"

// Create handlers for specific errors
function handleApiError(error: ApiError): Response {
  switch (error._tag) {
    case "NotFoundError": {
      const notFound = error as NarrowError<ApiError, "NotFoundError">;
      return new Response(`Not found: ${notFound.resourceId}`, { status: 404 });
    }
    case "PermissionError": {
      const permission = error as NarrowError<ApiError, "PermissionError">;
      return new Response(`Forbidden: ${permission.action}`, { status: 403 });
    }
  }
}

// Use in result handling
function handleResult(result: Result<Data, ApiError>): Response {
  if (isErr(result)) {
    return handleApiError(result.error);
  }
  return new Response(JSON.stringify(result.value), { status: 200 });
}
```

## Summary

| Type/Function | Purpose |
|---------------|---------|
| `InferErrorTag<E>` | Get single error's `_tag` literal type |
| `InferErrorTags<E>` | Get union of all `_tag` values from error union |
| `NarrowError<E, Tag>` | Extract specific error type from union by tag |
| `isResultError(e)` | Runtime check if value is a `ResultError` |
| `assertResultError(e)` | Runtime assertion (throws if not `ResultError`) |
