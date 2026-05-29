type ConvertTanStackSegment<TSegment extends string> = TSegment extends "$"
  ? "{_splat}"
  : TSegment extends `$${infer TParam}`
    ? TParam extends ""
      ? "{_splat}"
      : `{${TParam}}`
    : TSegment;

export type TanStackPathToOpenApiPath<TPath extends string> =
  TPath extends `${infer THead}/${infer TRest}`
    ? `${ConvertTanStackSegment<THead>}/${TanStackPathToOpenApiPath<TRest>}`
    : ConvertTanStackSegment<TPath>;

export type ExtractTanStackPathParams<TPath extends string> =
  TPath extends `${infer THead}/${infer TRest}`
    ? ExtractTanStackSegmentParam<THead> | ExtractTanStackPathParams<TRest>
    : ExtractTanStackSegmentParam<TPath>;

type ExtractTanStackSegmentParam<TSegment extends string> = TSegment extends "$"
  ? "_splat"
  : TSegment extends `$${infer TParam}`
    ? TParam extends ""
      ? "_splat"
      : TParam
    : never;

export function tanStackPathToOpenApiPath(path: string): string {
  return path
    .split("/")
    .map((segment) => {
      if (segment === "$") {
        return "{_splat}";
      }
      if (segment.startsWith("$")) {
        return `{${segment.slice(1)}}`;
      }
      return segment;
    })
    .join("/");
}
