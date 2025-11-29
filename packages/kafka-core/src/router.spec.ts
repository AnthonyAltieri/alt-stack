import { describe, it, expect } from "vitest";
import {
  createKafkaRouter,
  mergeKafkaRouters,
  kafkaRouter,
  KafkaRouter,
  init,
  publicProcedure,
} from "./index.js";
import { z } from "zod";

describe("KafkaRouter", () => {
  it("should create a router", () => {
    const router = createKafkaRouter();
    expect(router).toBeInstanceOf(KafkaRouter);
  });

  it("should register a procedure via kafkaRouter", () => {
    const router = kafkaRouter({
      "test-topic": publicProcedure
        .input({ message: z.object({ id: z.string() }) })
        .subscribe(({ input }) => {
          console.log(input.id);
        }),
    });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("test-topic");
  });

  it("should merge routers with prefix via nested config", () => {
    const { procedure } = init();

    const eventsRouter = kafkaRouter({
      events: procedure
        .input({ message: z.object({ type: z.string() }) })
        .subscribe(() => {}),
    });

    const router = kafkaRouter({
      v1: eventsRouter,
    });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("v1/events");
  });

  it("should merge multiple routers", () => {
    const { procedure } = init();

    const router1 = kafkaRouter({
      events: procedure
        .input({ message: z.object({ type: z.string() }) })
        .subscribe(() => {}),
    });

    const router2 = kafkaRouter({
      users: procedure
        .input({ message: z.object({ id: z.string() }) })
        .subscribe(() => {}),
    });

    const merged = mergeKafkaRouters(router1, router2);
    const procedures = merged.getProcedures();
    expect(procedures).toHaveLength(2);
    expect(procedures.map((p) => p.topic)).toContain("events");
    expect(procedures.map((p) => p.topic)).toContain("users");
  });

  it("should handle procedure middleware", async () => {
    const { procedure } = init();
    const calls: string[] = [];

    const router = kafkaRouter({
      test: procedure
        .input({ message: z.object({ value: z.string() }) })
        .use(async ({ next }) => {
          calls.push("procedure-middleware");
          return next();
        })
        .subscribe(() => {
          calls.push("handler");
        }),
    });

    const procedures = router.getProcedures();
    expect(procedures[0]?.middleware).toHaveLength(1);
  });

  it("should register pending procedure with handler()", () => {
    const { procedure } = init();

    const pendingProc = procedure
      .input({ message: z.object({ id: z.string() }) })
      .handler(({ input }) => {
        console.log(input.id);
      });

    // Can register it with a topic via registerPendingProcedure
    const router = createKafkaRouter();
    router.registerPendingProcedure("my-topic", pendingProc);

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("my-topic");
  });

  it("should support init() factory pattern", () => {
    interface AppContext {
      userId: string;
    }

    const { router, procedure, mergeRouters } = init<AppContext>();

    const router1 = router();
    router1.registerProcedure(
      "test",
      procedure
        .input({ message: z.object({ id: z.string() }) })
        .subscribe(({ ctx }) => {
          console.log(ctx.userId);
        }),
    );

    const router2 = router();
    router2.registerProcedure(
      "other",
      procedure
        .input({ message: z.object({ value: z.number() }) })
        .subscribe(() => {}),
    );

    const merged = mergeRouters(router1, router2);
    expect(merged.getProcedures()).toHaveLength(2);
  });
});
