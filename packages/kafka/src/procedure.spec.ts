import { describe, it, expect } from "vitest";
import { init, kafkaRouter, publicProcedure } from "./index.js";
import { z } from "zod";

describe("KafkaProcedure", () => {
  it("should build procedure with input validation", () => {
    const { procedure } = init();

    const readyProc = procedure
      .input({ message: z.object({ id: z.string(), value: z.number() }) })
      .subscribe(({ input }) => {
        // input is typed
        console.log(input.id);
      });

    expect(readyProc.config.input.message).toBeDefined();
    expect(readyProc.handler).toBeDefined();
    expect(readyProc.middleware).toBeDefined();
  });

  it("should build procedure with output validation", () => {
    const outputSchema = z.object({ result: z.string() });

    const readyProc = publicProcedure
      .input({ message: z.object({ id: z.string() }) })
      .output(outputSchema)
      .subscribe(() => {
        return { result: "success" };
      });

    expect(readyProc.config.output).toBe(outputSchema);
  });

  it("should build procedure with error schemas", () => {
    const { procedure } = init();
    const errorSchemas = {
      NOT_FOUND: z.object({
        error: z.object({
          code: z.literal("NOT_FOUND"),
          message: z.string(),
        }),
      }),
    };

    const readyProc = procedure
      .input({ message: z.object({ id: z.string() }) })
      .errors(errorSchemas)
      .subscribe(({ input, ctx }) => {
        if (input.id === "missing") {
          throw ctx.error({
            error: {
              code: "NOT_FOUND",
              message: "Not found",
            },
          });
        }
      });

    expect(readyProc.config.errors).toBeDefined();
  });

  it("should chain middleware", () => {
    const { procedure } = init();
    const calls: string[] = [];

    const readyProc = procedure
      .input({ message: z.object({ value: z.string() }) })
      .use(async ({ next }) => {
        calls.push("middleware-1");
        return next();
      })
      .use(async ({ next }) => {
        calls.push("middleware-2");
        return next();
      })
      .subscribe(() => {
        calls.push("handler");
      });

    expect(readyProc.middleware).toHaveLength(2);
  });

  it("should use base procedure builder with router", () => {
    interface AppContext {
      userId: string;
    }
    const { procedure } = init<AppContext>();
    const baseInput = z.object({ base: z.string() });
    const baseOutput = z.object({ baseResult: z.string() });

    const router = kafkaRouter<AppContext>({
      test: procedure
        .input({ message: baseInput })
        .output(baseOutput)
        .subscribe(() => {
          return { baseResult: "success" };
        }),
    });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
  });

  it("should create pending procedure with handler()", () => {
    const { procedure } = init();

    const pendingProc = procedure
      .input({ message: z.object({ id: z.string() }) })
      .handler(({ input }) => {
        console.log(input.id);
      });

    expect(pendingProc.config.input.message).toBeDefined();
    expect(pendingProc.handler).toBeDefined();
    expect(pendingProc.middleware).toBeDefined();
    // PendingProcedure doesn't have a topic yet
    expect((pendingProc as any).topic).toBeUndefined();
  });

  it("should work with kafkaRouter object-based config", () => {
    const { procedure } = init();

    const router = kafkaRouter({
      "test-topic": procedure
        .input({ message: z.object({ id: z.string() }) })
        .subscribe(({ input }) => {
          console.log(input.id);
        }),
    });

    const procedures = router.getProcedures();
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.topic).toBe("test-topic");
  });
});
