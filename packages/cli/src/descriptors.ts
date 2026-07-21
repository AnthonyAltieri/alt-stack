import { z } from "zod";

export interface ArgumentMetadata<TOptional extends boolean = boolean> {
  description?: string;
  metavar?: string;
  optional?: TOptional;
}

export interface VariadicArgumentMetadata {
  description?: string;
  metavar?: string;
}

export interface OptionMetadata {
  description?: string;
  metavar?: string;
  short?: string;
}

export interface FlagMetadata {
  description?: string;
  short?: string;
}

export interface ArgumentDescriptor<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly kind: "argument";
  readonly schema: TSchema;
  readonly description?: string;
  readonly metavar?: string;
  readonly optional: boolean;
}

export interface VariadicArgumentDescriptor<
  TSchema extends z.ZodTypeAny = z.ZodTypeAny,
> {
  readonly kind: "variadic-argument";
  readonly schema: TSchema;
  readonly description?: string;
  readonly metavar?: string;
}

export interface OptionDescriptor<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  readonly kind: "option";
  readonly schema: TSchema;
  readonly description?: string;
  readonly metavar?: string;
  readonly short?: string;
}

export interface FlagDescriptor<
  TSchema extends z.ZodTypeAny = z.ZodDefault<z.ZodBoolean>,
> {
  readonly kind: "flag";
  readonly schema: TSchema;
  readonly description?: string;
  readonly short?: string;
}

export type AnyArgumentDescriptor =
  | ArgumentDescriptor
  | VariadicArgumentDescriptor;

export type AnyOptionDescriptor = OptionDescriptor | FlagDescriptor;

export type ArgumentMap = Readonly<Record<string, AnyArgumentDescriptor>>;
export type OptionMap = Readonly<Record<string, AnyOptionDescriptor>>;

export type InferDescriptor<TDescriptor> = TDescriptor extends {
  readonly schema: infer TSchema extends z.ZodTypeAny;
}
  ? z.output<TSchema>
  : never;

export type InferDescriptorMap<TMap extends Readonly<Record<string, unknown>>> = {
  -readonly [TKey in keyof TMap]: InferDescriptor<TMap[TKey]>;
};

export function argument<
  TSchema extends z.ZodTypeAny,
  const TOptional extends boolean = false,
>(
  schema: TSchema,
  metadata?: ArgumentMetadata<TOptional>,
): ArgumentDescriptor<TOptional extends true ? z.ZodOptional<TSchema> : TSchema> {
  const optional = metadata?.optional === true;
  const effectiveSchema = optional ? schema.optional() : schema;

  return Object.freeze({
    kind: "argument",
    schema: effectiveSchema,
    description: metadata?.description,
    metavar: metadata?.metavar,
    optional,
  }) as ArgumentDescriptor<
    TOptional extends true ? z.ZodOptional<TSchema> : TSchema
  >;
}

export function variadicArgument<TElementSchema extends z.ZodTypeAny>(
  elementSchema: TElementSchema,
  metadata?: VariadicArgumentMetadata,
): VariadicArgumentDescriptor<z.ZodArray<TElementSchema>> {
  return Object.freeze({
    kind: "variadic-argument",
    schema: z.array(elementSchema),
    description: metadata?.description,
    metavar: metadata?.metavar,
  });
}

export function option<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  metadata?: OptionMetadata,
): OptionDescriptor<TSchema> {
  return Object.freeze({
    kind: "option",
    schema,
    description: metadata?.description,
    metavar: metadata?.metavar,
    short: metadata?.short,
  });
}

export function flag(metadata?: FlagMetadata): FlagDescriptor {
  return Object.freeze({
    kind: "flag",
    schema: z.boolean().default(false),
    description: metadata?.description,
    short: metadata?.short,
  });
}

export function optionNameFromKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();
}
