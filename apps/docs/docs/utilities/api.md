# Utilities API Documentation

Package: `@alt-stack/zod-error`

## `zodErrorToString`

```typescript
function zodErrorToString(error: ZodError): string;
```

Formats every Zod issue as `path: message`, joining nested path segments with `.` and issues with `; `. When `issue.path` is empty, the path is `(root)`. An error with no issues produces an empty string.

The function does not include the issue code or rejected input in the string.

## `zodErrorToStructuredLog`

```typescript
function zodErrorToStructuredLog(
  error: ZodError,
  input?: unknown,
): StructuredLogError;
```

Builds a new object from the Zod issues. The `input` property is omitted when the second argument is `undefined`; otherwise it is included without cloning or redaction.

## `StructuredLogError`

```typescript
interface StructuredLogError {
  type: "ZodValidationError";
  message: string;
  issueCount: number;
  issues: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  input?: unknown;
}
```

| Property | Source and behavior |
| --- | --- |
| `type` | constant `"ZodValidationError"` discriminator |
| `message` | output of `zodErrorToString(error)` |
| `issueCount` | `error.issues.length` |
| `issues` | one new entry for every Zod issue, in the original order |
| `issues[].path` | dot-joined issue path, or `(root)` for an empty path |
| `issues[].message` | Zod's issue message |
| `issues[].code` | Zod's issue code |
| `input` | optional caller-provided value, included only when not `undefined` |

Because `input` is `unknown`, the type does not provide privacy or serialization guarantees. Validate or redact it before logging.
