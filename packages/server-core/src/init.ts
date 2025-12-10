import { Router, mergeRouters } from "./router.js";
import { BaseProcedureBuilder } from "./procedure-builder.js";
import { z } from "zod";
import type { ZodError } from "zod";

// Default error schemas - exported for type inference
// IMPORTANT: These must have _tag: z.literal("...") for HasTagLiteral validation to pass
export const default400ErrorSchema = z.object({
  _tag: z.literal("ValidationError"),
  code: z.literal("VALIDATION_ERROR"),
  message: z.string(),
  details: z.array(z.string()),
});

export const default500ErrorSchema = z.object({
  _tag: z.literal("InternalServerError"),
  code: z.literal("INTERNAL_SERVER_ERROR"),
  message: z.string(),
  details: z.array(z.string()),
});

// Helper type to extract schema from handler return type
type ExtractSchemaFromHandler<
  THandler extends (...args: any[]) => [z.ZodObject<any>, any],
> = THandler extends (...args: any[]) => [infer TSchema, any]
  ? TSchema
  : never;

// Type for default errors based on InitOptions
type DefaultErrorSchemas<TInitOptions extends InitOptions | undefined> = {
  400: TInitOptions extends { default400Error: infer T }
    ? T extends (...args: any[]) => [infer TSchema, any]
      ? TSchema
      : typeof default400ErrorSchema
    : typeof default400ErrorSchema;
  500: TInitOptions extends { default500Error: infer T }
    ? T extends (...args: any[]) => [infer TSchema, any]
      ? TSchema
      : typeof default500ErrorSchema
    : typeof default500ErrorSchema;
};

export interface InitOptions<TCustomContext extends object = Record<string, never>> {
  default400Error?: (
    errors: Array<[error: ZodError, variant: "body" | "param" | "query", value: unknown]>,
  ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
  default500Error?: (error: unknown) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
}

export interface InitResult<
  TCustomContext extends object = Record<string, never>,
  TInitOptions extends InitOptions<TCustomContext> | undefined = undefined,
> {
  router: (
    config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  ) => Router<TCustomContext>;
  mergeRouters: (...routers: Router<TCustomContext>[]) => Router<TCustomContext>;
  procedure: BaseProcedureBuilder<
    { params?: never; query?: never; body?: never },
    undefined,
    undefined,
    TCustomContext,
    unknown,
    DefaultErrorSchemas<TInitOptions>
  >;
  defaultErrorHandlers?: {
    default400Error: TInitOptions extends { default400Error: infer T }
      ? T
      : (
          errors: Array<[error: ZodError, variant: "body" | "param" | "query", value: unknown]>,
        ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
    default500Error: TInitOptions extends { default500Error: infer T }
      ? T
      : (error: unknown) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
    default400ErrorSchema: TInitOptions extends { default400Error: infer T }
      ? T extends (...args: any[]) => [z.ZodObject<any>, any]
        ? ExtractSchemaFromHandler<T>
        : typeof default400ErrorSchema
      : typeof default400ErrorSchema;
    default500ErrorSchema: TInitOptions extends { default500Error: infer T }
      ? T extends (...args: any[]) => [z.ZodObject<any>, any]
        ? ExtractSchemaFromHandler<T>
        : typeof default500ErrorSchema
      : typeof default500ErrorSchema;
  };
}

// Helper function to create default 400 error instance from accumulated errors
function createDefault400Error(
  errors: Array<[ZodError, "body" | "param" | "query", unknown]>,
): z.infer<typeof default400ErrorSchema> {
  const allDetails: string[] = [];

  for (const [zodError, variant, value] of errors) {
    const variantDetails = zodError.issues.map(
      (e) => `${variant}.${e.path.join(".")}: ${e.message}`,
    );
    allDetails.push(...variantDetails);
  }

  return {
    _tag: "ValidationError" as const,
    code: "VALIDATION_ERROR" as const,
    message: `Validation failed for ${errors.map(([_, v]) => v).join(", ")}`,
    details: allDetails,
  };
}

// Helper function to create default 500 error instance
function createDefault500Error(error: unknown): z.infer<typeof default500ErrorSchema> {
  const message = error instanceof Error ? error.message : "Internal server error";
  const details: string[] = [];
  if (error instanceof Error && error.stack) {
    details.push(error.stack);
  }
  return {
    _tag: "InternalServerError" as const,
    code: "INTERNAL_SERVER_ERROR" as const,
    message,
    details,
  };
}

// Export publicProcedure directly with default error schemas
export const publicProcedure = new BaseProcedureBuilder<
  { params?: never; query?: never; body?: never },
  undefined,
  undefined,
  Record<string, never>,
  unknown,
  { 400: typeof default400ErrorSchema; 500: typeof default500ErrorSchema }
>();

export function init<TCustomContext extends object = Record<string, never>>(
  options?: InitOptions<TCustomContext>,
): InitResult<TCustomContext, typeof options> {
  // Create default error handlers
  const default400ErrorHandler =
    options?.default400Error ??
    ((errors: Array<[ZodError, "body" | "param" | "query", unknown]>) => [
      default400ErrorSchema,
      createDefault400Error(errors),
    ]);

  const default500ErrorHandler =
    options?.default500Error ??
    ((error: unknown) => [default500ErrorSchema, createDefault500Error(error)]);

  // Extract schemas from handlers
  // Call handlers with dummy data to get the schema (only for type inference, not runtime)
  // At runtime, we'll extract the schema from the first call's return value
  const get400Schema = () => {
    if (options?.default400Error) {
      // Call with empty array to get schema
      const [schema] = options.default400Error([]);
      return schema;
    }
    return default400ErrorSchema;
  };

  const get500Schema = () => {
    if (options?.default500Error) {
      // Call with null to get schema
      const [schema] = options.default500Error(null);
      return schema;
    }
    return default500ErrorSchema;
  };

  return {
    router: (
      config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
    ) => new Router<TCustomContext>(config),
    mergeRouters: (...routers: Router<TCustomContext>[]) => mergeRouters(...routers),
    procedure: new BaseProcedureBuilder<
      { params?: never; query?: never; body?: never },
      undefined,
      undefined,
      TCustomContext,
      unknown,
      DefaultErrorSchemas<typeof options>
    >(),
    defaultErrorHandlers: {
      default400Error: default400ErrorHandler,
      default500Error: default500ErrorHandler,
      default400ErrorSchema: get400Schema(),
      default500ErrorSchema: get500Schema(),
    },
  };
}

