// Core types
export type { Result, Ok, Err, ResultError } from "./result.js";
export { TaggedError } from "./result.js";

// Constructors
export { ok, err } from "./constructors.js";

// Type guards
export { isOk, isErr } from "./guards.js";

// Transformations
export { map, flatMap, mapError, catchError } from "./transformations.js";

// Extraction
export {
  unwrap,
  unwrapOr,
  unwrapOrElse,
  getOrUndefined,
  getErrorOrUndefined,
} from "./extraction.js";

// Pattern matching
export { match, fold } from "./matching.js";

// Async utilities
export type { ResultAsync } from "./async.js";
export { fromPromise, tryCatch, tryCatchAsync } from "./async.js";

// Combinators
export { all, firstOk, tap, tapError, ResultAggregateError } from "./combinators.js";

// Error inference helpers
export type { InferErrorTag, InferErrorTags, NarrowError } from "./infer.js";
export { isResultError, assertResultError } from "./infer.js";
