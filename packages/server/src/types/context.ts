import type { Context } from "hono";
import type { z } from "zod";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<number, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

export interface InputConfig {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
}

export type InferInput<T extends InputConfig> = (T extends { params: infer P }
  ? P extends z.ZodTypeAny
    ? z.infer<P>
    : {}
  : {}) &
  (T extends { query: infer Q }
    ? Q extends z.ZodTypeAny
      ? z.infer<Q>
      : {}
    : {}) &
  (T extends { body: infer B }
    ? B extends z.ZodTypeAny
      ? z.infer<B>
      : {}
    : {});

export interface BaseContext {
  hono: Context;
}

export type TypedContext<
  TInput extends InputConfig,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseContext &
  TCustomContext & {
    input: InferInput<TInput>;
    error: TErrors extends Record<number, z.ZodTypeAny>
      ? (error: ErrorUnion<TErrors>) => never
      : never;
  };
