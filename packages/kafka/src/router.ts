import type { z } from "zod";
import type {
  InputConfig,
  KafkaProcedure,
  ReadyKafkaProcedure,
  PendingKafkaProcedure,
} from "./types.js";
import { BaseKafkaProcedureBuilder } from "./procedure.js";

function normalizePrefix(prefix: string): string {
  // Remove trailing slash if present
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

export class KafkaRouter<
  TCustomContext extends object = Record<string, never>,
  TTopicMap extends Record<string, z.ZodTypeAny> = Record<string, z.ZodTypeAny>,
> {
  private procedures: KafkaProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  /** Type-only property to preserve topic->message type mapping */
  declare readonly _topicTypes: TTopicMap;

  constructor(
    config?: Record<string, KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]>,
  ) {
    if (config) {
      for (const [prefix, value] of Object.entries(config)) {
        const routers = Array.isArray(value) ? value : [value];
        for (const router of routers) {
          this.merge(prefix, router);
        }
      }
    }
  }

  /**
   * Register a ReadyKafkaProcedure with a topic
   */
  registerProcedure<TInput extends InputConfig>(
    topic: string,
    readyProcedure: ReadyKafkaProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    const procedure: KafkaProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      topic,
      config: readyProcedure.config,
      handler: readyProcedure.handler,
      middleware: readyProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as KafkaProcedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  /**
   * Register a PendingKafkaProcedure with a topic
   */
  registerPendingProcedure<TInput extends InputConfig>(
    topic: string,
    pendingProcedure: PendingKafkaProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    const procedure: KafkaProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      topic,
      config: pendingProcedure.config,
      handler: pendingProcedure.handler,
      middleware: pendingProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as KafkaProcedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  register(
    procedure: KafkaProcedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    this.procedures.push(procedure);
    return this;
  }

  merge(prefix: string, router: KafkaRouter<TCustomContext>): this {
    const normalizedPrefix = normalizePrefix(prefix);
    const mergedProcedures = router.procedures.map((proc) => ({
      ...proc,
      topic: normalizedPrefix ? `${normalizedPrefix}/${proc.topic}` : proc.topic,
    }));
    this.procedures.push(...mergedProcedures);
    return this;
  }

  getProcedures(): KafkaProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] {
    return this.procedures;
  }

  get procedure(): BaseKafkaProcedureBuilder<
    { message?: never },
    undefined,
    undefined,
    TCustomContext,
    this
  > {
    return new BaseKafkaProcedureBuilder<
      { message?: never },
      undefined,
      undefined,
      TCustomContext,
      this
    >(undefined, undefined, this);
  }
}

// Type helper for router config values
type RouterConfigValue<TCustomContext extends object> =
  | ReadyKafkaProcedure<any, any, any, any>
  | PendingKafkaProcedure<any, any, any, any>
  | KafkaRouter<TCustomContext, any>;

// Type helper to extract message schema from a procedure
type ExtractMessageSchema<T> =
  T extends ReadyKafkaProcedure<infer TInput, any, any, any>
    ? TInput extends { message: infer TMessage }
      ? TMessage extends z.ZodTypeAny
        ? TMessage
        : z.ZodUnknown
      : z.ZodUnknown
    : T extends PendingKafkaProcedure<infer TInput, any, any, any>
      ? TInput extends { message: infer TMessage }
        ? TMessage extends z.ZodTypeAny
          ? TMessage
          : z.ZodUnknown
        : z.ZodUnknown
      : T extends KafkaRouter<any, infer TTopicMap>
        ? TTopicMap
        : z.ZodUnknown;

// Type helper to build topic map from config
type BuildTopicMap<
  TConfig extends Record<string, RouterConfigValue<any>>,
  TPrefix extends string = "",
> = {
  [K in keyof TConfig as TConfig[K] extends KafkaRouter<any, any>
    ? never
    : TPrefix extends ""
      ? K & string
      : `${TPrefix}/${K & string}`]: ExtractMessageSchema<TConfig[K]>;
} & (TConfig extends Record<string, RouterConfigValue<any>>
  ? UnionToIntersection<
      {
        [K in keyof TConfig]: TConfig[K] extends KafkaRouter<any, infer TNestedMap>
          ? PrefixKeys<TNestedMap, TPrefix extends "" ? K & string : `${TPrefix}/${K & string}`>
          : never;
      }[keyof TConfig]
    >
  : object);

// Helper to prefix all keys in a record
type PrefixKeys<T extends Record<string, any>, P extends string> = {
  [K in keyof T as `${P}/${K & string}`]: T[K];
};

// Helper to convert union to intersection
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/**
 * Helper to check if a value is a ReadyKafkaProcedure
 */
function isReadyProcedure(value: unknown): value is ReadyKafkaProcedure<any, any, any, any> {
  return (
    typeof value === "object" &&
    value !== null &&
    "handler" in value &&
    "config" in value &&
    "middleware" in value &&
    !(value instanceof KafkaRouter)
  );
}

/**
 * Create a Kafka router with object-based configuration.
 * Topics are defined as keys, and values can be:
 * - ReadyKafkaProcedure (from .subscribe())
 * - PendingKafkaProcedure (from .handler())
 * - Nested KafkaRouter (for topic prefixing)
 *
 * @example
 * ```typescript
 * const { procedure, router } = init<AppContext>();
 *
 * const appRouter = kafkaRouter<AppContext>({
 *   "user-events": procedure
 *     .input({ message: UserEventSchema })
 *     .subscribe(({ input, ctx }) => {
 *       console.log("User event:", input);
 *     }),
 *
 *   "orders": kafkaRouter<AppContext>({
 *     "created": procedure
 *       .input({ message: OrderSchema })
 *       .subscribe(({ input }) => {
 *         console.log("Order created:", input.orderId);
 *       }),
 *   }),
 * });
 * ```
 */
export function kafkaRouter<
  TCustomContext extends object = Record<string, never>,
  TConfig extends {
    [K in string]: RouterConfigValue<TCustomContext>;
  } = {
    [K in string]: RouterConfigValue<TCustomContext>;
  },
>(
  config: TConfig,
): KafkaRouter<TCustomContext, BuildTopicMap<TConfig>> {
  const routerInstance = new KafkaRouter<TCustomContext>();

  for (const [key, value] of Object.entries(config)) {
    if (value instanceof KafkaRouter) {
      // Nested router - merge it with the topic as prefix
      routerInstance.merge(key, value);
    } else if (isReadyProcedure(value)) {
      // ReadyKafkaProcedure or PendingKafkaProcedure - register with topic
      routerInstance.registerProcedure(key, value);
    }
  }

  return routerInstance as unknown as KafkaRouter<TCustomContext, BuildTopicMap<TConfig>>;
}

export function createKafkaRouter<TCustomContext extends object = Record<string, never>>(
  config?: Record<string, KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]>,
): KafkaRouter<TCustomContext> {
  return new KafkaRouter<TCustomContext>(config);
}

export function mergeKafkaRouters<TCustomContext extends object = Record<string, never>>(
  ...routers: KafkaRouter<TCustomContext>[]
): KafkaRouter<TCustomContext> {
  const mergedRouter = new KafkaRouter<TCustomContext>();
  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    for (const procedure of routerProcedures) {
      mergedRouter.register(procedure);
    }
  }
  return mergedRouter;
}
