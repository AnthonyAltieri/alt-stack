import type { Err, Result, ResultError } from "@alt-stack/result";

type OptionalKeys<TType extends object> = {
  [TKey in keyof TType]-?: object extends Pick<TType, TKey> ? TKey : never;
}[keyof TType];

type RequiredKeys<TType extends object> = Exclude<
  keyof TType,
  OptionalKeys<TType>
>;

type OptionalCollisions<
  TType extends object,
  TWith extends object,
> = Extract<OptionalKeys<TWith>, keyof TType>;

type RequiredOptionalCollisions<
  TType extends object,
  TWith extends object,
> = Extract<OptionalCollisions<TType, TWith>, RequiredKeys<TType>>;

type OptionalOptionalCollisions<
  TType extends object,
  TWith extends object,
> = Exclude<OptionalCollisions<TType, TWith>, RequiredKeys<TType>>;

export type Overwrite<
  TType extends object,
  TWith extends object,
> = Omit<TType, keyof TWith> &
  Omit<TWith, OptionalCollisions<TType, TWith>> & {
    [TKey in RequiredOptionalCollisions<TType, TWith>]-?:
      | TType[TKey]
      | TWith[TKey];
  } & {
    [TKey in OptionalOptionalCollisions<TType, TWith>]?:
      | TType[TKey]
      | TWith[TKey];
  };

const middlewareResultMarker = Symbol("alt-stack-cli-middleware-result");

export interface MiddlewareResult<TContextOverride extends object> {
  readonly marker: typeof middlewareResultMarker;
  readonly result: Result<unknown, ResultError>;
  /** Type-only carrier for context inferred from next({ ctx }). */
  readonly contextOverride?: TContextOverride;
}

export interface MiddlewareNext {
  (): Promise<MiddlewareResult<Record<never, never>>>;
  <TContextOverride extends object>(options: {
    ctx: TContextOverride;
  }): Promise<MiddlewareResult<TContextOverride>>;
}

export type MiddlewareFunction<
  TContext extends object,
  TContextOverride extends object,
> = (options: {
  ctx: TContext;
  next: MiddlewareNext;
}) => Promise<MiddlewareResult<TContextOverride> | Err<ResultError>>;

export interface RuntimeMiddlewareOptions {
  ctx: object;
  next(options?: { ctx?: object }): Promise<MiddlewareResult<object>>;
}

export type RuntimeMiddleware = (
  options: RuntimeMiddlewareOptions,
) => Promise<MiddlewareResult<object> | Err<ResultError>>;

export function middlewareResult<TContextOverride extends object>(
  result: Result<unknown, ResultError>,
): MiddlewareResult<TContextOverride> {
  return {
    marker: middlewareResultMarker,
    result,
  };
}

export function isMiddlewareResult(
  value: unknown,
): value is MiddlewareResult<object> {
  return (
    typeof value === "object" &&
    value !== null &&
    "marker" in value &&
    value.marker === middlewareResultMarker
  );
}
