# Utilities common patterns

## Keep invalid input out of logs by default

`zodErrorToStructuredLog` accepts the rejected input as an optional second argument. Omit it unless the log destination, retention policy, and data classification permit the payload.

Fragment inside an `if (!parsed.success)` branch; `logger` is the application's structured logger:

```typescript
const event = zodErrorToStructuredLog(parsed.error);
logger.info(event, "request rejected");
```

If the input is useful for diagnosis, pass a redacted projection rather than the original boundary value.

Fragment inside an `if (!parsed.success)` branch, after `input` has been narrowed to `Record<string, unknown>`; `logger` is the application's structured logger:

```typescript
const safeInput = {
  emailDomain:
    typeof input.email === "string" ? input.email.split("@")[1] : undefined,
  suppliedFields: Object.keys(input),
};

logger.info(
  zodErrorToStructuredLog(parsed.error, safeInput),
  "request rejected",
);
```

## Select text or structure at the final boundary

Use `zodErrorToString` for a CLI message or compact diagnostic. Use `zodErrorToStructuredLog` when log processors need fields such as `issueCount`, `path`, or `code`.

Fragment where `error` is a `ZodError`, `format` is the caller's output choice, and `logger` is the application's structured logger:

```typescript
if (format === "text") {
  process.stderr.write(`${zodErrorToString(error)}\n`);
} else {
  logger.error(zodErrorToStructuredLog(error));
}
```

Neither function changes the `ZodError`, maps errors into Altstack `Result` values, or selects an HTTP status. Those decisions belong to the caller.

## Preserve Zod's issue order

Both formatters iterate `error.issues` in its existing order. If consumers require a different sort or grouping, transform the returned `issues` array after formatting rather than assuming it is grouped by path.

## See also

[Utilities API Documentation](./api.md) describes every property and the exact path normalization.
