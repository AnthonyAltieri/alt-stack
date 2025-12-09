import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  isOk,
  isErr,
  map,
  flatMap,
  mapError,
  catchError,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  getOrUndefined,
  getErrorOrUndefined,
  match,
  fold,
  tryCatch,
  tryCatchAsync,
  fromPromise,
  all,
  firstOk,
  tap,
  tapError,
  isResultError,
  assertResultError,
  ResultAggregateError,
  type Result,
  type ResultError,
} from "./index.js";

// Test error classes
class TestError extends Error {
  readonly _tag = "TestError" as const;
  constructor(message: string) {
    super(message);
    this.name = "TestError";
  }
}

class NotFoundError extends Error {
  readonly _tag = "NotFoundError" as const;
  constructor(
    public readonly database: string,
    public readonly resourceId: string,
  ) {
    super(`Resource ${resourceId} not found in ${database}`);
    this.name = "NotFoundError";
  }
}

class ValidationError extends Error {
  readonly _tag = "ValidationError" as const;
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

class ParseError extends Error {
  readonly _tag = "ParseError" as const;
  constructor(public readonly originalError: unknown) {
    super(`Parse failed: ${String(originalError)}`);
    this.name = "ParseError";
  }
}

class WrappedError extends Error {
  readonly _tag = "WrappedError" as const;
  constructor(public readonly original: ResultError) {
    super(`Wrapped: ${original.message}`);
    this.name = "WrappedError";
  }
}

describe("constructors", () => {
  it("ok creates success result", () => {
    const result = ok(42);
    expect(result._tag).toBe("Ok");
    expect(result.value).toBe(42);
  });

  it("ok void creates success result", () => {
    const result = ok();
    expect(result._tag).toBe("Ok");
    expect(result.value).toBeUndefined();
  });

  it("err creates failure result with tagged error", () => {
    const error = new TestError("something went wrong");
    const result = err(error);
    expect(result._tag).toBe("Err");
    expect(result.error).toBe(error);
    expect(result.error._tag).toBe("TestError");
    expect(result.error.message).toBe("something went wrong");
  });
});

describe("guards", () => {
  it("isOk returns true for Ok", () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it("isErr returns true for Err", () => {
    const result = err(new TestError("error"));
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it("type narrows correctly", () => {
    const result: Result<number, TestError> = ok(42);
    if (isOk(result)) {
      const value: number = result.value;
      expect(value).toBe(42);
    }
  });

  it("error type narrows correctly with _tag", () => {
    const result: Result<number, NotFoundError | ValidationError> = err(
      new NotFoundError("users", "123"),
    );
    if (isErr(result)) {
      // Can use exhaustive switch on _tag
      switch (result.error._tag) {
        case "NotFoundError":
          expect(result.error.database).toBe("users");
          expect(result.error.resourceId).toBe("123");
          break;
        case "ValidationError":
          // This branch won't execute
          break;
      }
    }
  });
});

describe("transformations", () => {
  describe("map", () => {
    it("transforms Ok value", () => {
      const result = map(ok(5), (x) => x * 2);
      expect(result).toEqual(ok(10));
    });

    it("passes through Err", () => {
      const error = new TestError("error");
      const result = map(
        err(error) as Result<number, TestError>,
        (x) => x * 2,
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });
  });

  describe("flatMap", () => {
    it("chains Ok results", () => {
      const result = flatMap(ok(5), (x) => ok(x * 2));
      expect(result).toEqual(ok(10));
    });

    it("short-circuits on Err", () => {
      const error = new TestError("first");
      const result = flatMap(
        err(error) as Result<number, TestError>,
        (x) => ok(x * 2),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it("returns inner Err", () => {
      const innerError = new ValidationError("email", "Invalid email");
      const result = flatMap(ok(5), (_x) => err(innerError));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(innerError);
      }
    });
  });

  describe("mapError", () => {
    it("transforms Err value", () => {
      const original = new TestError("error");
      const result = mapError(err(original), (e) => new WrappedError(e));
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error._tag).toBe("WrappedError");
        expect(result.error.original).toBe(original);
      }
    });

    it("passes through Ok", () => {
      const result = mapError(
        ok(42) as Result<number, TestError>,
        (e) => new WrappedError(e),
      );
      expect(result).toEqual(ok(42));
    });
  });

  describe("catchError", () => {
    it("recovers from Err", () => {
      const result = catchError(
        err(new TestError("error")) as Result<number, TestError>,
        (_e) => ok(0),
      );
      expect(result).toEqual(ok(0));
    });

    it("passes through Ok", () => {
      const result = catchError(ok(42), (_e) => ok(0));
      expect(result).toEqual(ok(42));
    });
  });
});

describe("extraction", () => {
  describe("unwrap", () => {
    it("extracts Ok value", () => {
      expect(unwrap(ok(42))).toBe(42);
    });

    it("throws the Error instance on Err", () => {
      const error = new TestError("test error");
      expect(() => unwrap(err(error))).toThrow(error);
    });
  });

  describe("unwrapOr", () => {
    it("extracts Ok value", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("returns default for Err", () => {
      expect(
        unwrapOr(err(new TestError("error")) as Result<number, TestError>, 0),
      ).toBe(0);
    });
  });

  describe("unwrapOrElse", () => {
    it("extracts Ok value", () => {
      expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
    });

    it("computes default from error", () => {
      const result: Result<number, NotFoundError> = err(
        new NotFoundError("users", "123"),
      );
      expect(unwrapOrElse(result, (e) => e.resourceId.length)).toBe(3);
    });
  });

  describe("getOrUndefined", () => {
    it("returns value for Ok", () => {
      expect(getOrUndefined(ok(42))).toBe(42);
    });

    it("returns undefined for Err", () => {
      expect(getOrUndefined(err(new TestError("error")))).toBeUndefined();
    });
  });

  describe("getErrorOrUndefined", () => {
    it("returns undefined for Ok", () => {
      expect(getErrorOrUndefined(ok(42))).toBeUndefined();
    });

    it("returns error for Err", () => {
      const error = new TestError("error");
      expect(getErrorOrUndefined(err(error))).toBe(error);
    });
  });
});

describe("matching", () => {
  describe("match", () => {
    it("calls ok handler for Ok", () => {
      const result = match(ok(42), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e._tag}`,
      });
      expect(result).toBe("value: 42");
    });

    it("calls err handler for Err", () => {
      const result = match(
        err(new TestError("failed")) as Result<number, TestError>,
        {
          ok: (v) => `value: ${v}`,
          err: (e) => `error: ${e._tag}`,
        },
      );
      expect(result).toBe("error: TestError");
    });
  });

  describe("fold", () => {
    it("applies onOk for Ok", () => {
      const result = fold(
        ok(42),
        () => 0,
        (v) => v * 2,
      );
      expect(result).toBe(84);
    });

    it("applies onErr for Err", () => {
      const result = fold(
        err(new NotFoundError("users", "123")) as Result<
          number,
          NotFoundError
        >,
        (e) => e.resourceId.length,
        (v) => v * 2,
      );
      expect(result).toBe(3);
    });
  });
});

describe("async", () => {
  describe("tryCatch", () => {
    it("returns Ok for success", () => {
      const result = tryCatch(
        () => JSON.parse('{"a":1}'),
        (e) => new ParseError(e),
      );
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual({ a: 1 });
      }
    });

    it("returns Err for failure", () => {
      const result = tryCatch(
        () => JSON.parse("invalid"),
        (e) => new ParseError(e),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error._tag).toBe("ParseError");
      }
    });
  });

  describe("tryCatchAsync", () => {
    it("returns Ok for success", async () => {
      const result = await tryCatchAsync(
        async () => 42,
        (e) => new TestError(String(e)),
      );
      expect(result).toEqual(ok(42));
    });

    it("returns Err for failure", async () => {
      const result = await tryCatchAsync(
        async () => {
          throw new Error("failed");
        },
        (e) => new TestError(String(e)),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error._tag).toBe("TestError");
      }
    });
  });

  describe("fromPromise", () => {
    it("returns Ok for resolved promise", async () => {
      const result = await fromPromise(
        Promise.resolve(42),
        (e) => new TestError(String(e)),
      );
      expect(result).toEqual(ok(42));
    });

    it("returns Err for rejected promise", async () => {
      const result = await fromPromise(
        Promise.reject(new Error("failed")),
        (e) => new TestError(String(e)),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error._tag).toBe("TestError");
      }
    });
  });
});

describe("combinators", () => {
  describe("all", () => {
    it("collects all Ok values", () => {
      const result = all([ok(1), ok(2), ok(3)]);
      expect(result).toEqual(ok([1, 2, 3]));
    });

    it("returns first Err", () => {
      const error = new TestError("error");
      const result = all([
        ok(1),
        err(error) as Result<number, TestError>,
        ok(3),
      ]);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it("handles empty array", () => {
      const result = all([]);
      expect(result).toEqual(ok([]));
    });
  });

  describe("firstOk", () => {
    it("returns first Ok", () => {
      const result = firstOk([
        err(new TestError("a")),
        ok(1),
        err(new TestError("b")),
      ] as Result<number, TestError>[]);
      expect(result).toEqual(ok(1));
    });

    it("returns AggregateError if no Ok", () => {
      const errorA = new TestError("a");
      const errorB = new TestError("b");
      const result = firstOk([err(errorA), err(errorB)]);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error._tag).toBe("ResultAggregateError");
        expect(result.error).toBeInstanceOf(ResultAggregateError);
        expect(result.error.errors).toHaveLength(2);
        expect(result.error.errors[0]).toBe(errorA);
        expect(result.error.errors[1]).toBe(errorB);
      }
    });
  });

  describe("tap", () => {
    it("runs side effect for Ok", () => {
      let sideEffect = 0;
      const result = tap(ok(42), (v) => {
        sideEffect = v;
      });
      expect(result).toEqual(ok(42));
      expect(sideEffect).toBe(42);
    });

    it("skips side effect for Err", () => {
      let sideEffect = 0;
      const result = tap(
        err(new TestError("error")) as Result<number, TestError>,
        (v) => {
          sideEffect = v;
        },
      );
      expect(isErr(result)).toBe(true);
      expect(sideEffect).toBe(0);
    });
  });

  describe("tapError", () => {
    it("runs side effect for Err", () => {
      let sideEffect = "";
      const error = new TestError("error");
      const result = tapError(err(error), (e) => {
        sideEffect = e._tag;
      });
      expect(isErr(result)).toBe(true);
      expect(sideEffect).toBe("TestError");
    });

    it("skips side effect for Ok", () => {
      let sideEffect = "";
      const result = tapError(
        ok(42) as Result<number, TestError>,
        (e) => {
          sideEffect = e._tag;
        },
      );
      expect(result).toEqual(ok(42));
      expect(sideEffect).toBe("");
    });
  });
});

describe("error inference helpers", () => {
  describe("isResultError", () => {
    it("returns true for valid ResultError", () => {
      const error = new TestError("test");
      expect(isResultError(error)).toBe(true);
    });

    it("returns false for plain Error without _tag", () => {
      const error = new Error("test");
      expect(isResultError(error)).toBe(false);
    });

    it("returns false for non-Error objects", () => {
      expect(isResultError({ _tag: "Test" })).toBe(false);
      expect(isResultError("error")).toBe(false);
      expect(isResultError(null)).toBe(false);
    });
  });

  describe("assertResultError", () => {
    it("does not throw for valid ResultError", () => {
      const error = new TestError("test");
      expect(() => assertResultError(error)).not.toThrow();
    });

    it("throws TypeError for plain Error without _tag", () => {
      const error = new Error("test");
      expect(() => assertResultError(error)).toThrow(TypeError);
      expect(() => assertResultError(error)).toThrow(
        "Error must have a readonly _tag string property",
      );
    });

    it("throws TypeError for non-Error objects", () => {
      expect(() => assertResultError({ _tag: "Test" })).toThrow(TypeError);
      expect(() => assertResultError({ _tag: "Test" })).toThrow(
        "Error must be an instance of Error",
      );
    });
  });
});

describe("exhaustive error handling", () => {
  it("supports exhaustive switch on error _tag", () => {
    type MyErrors = NotFoundError | ValidationError;
    const result: Result<number, MyErrors> = err(
      new NotFoundError("todos", "123"),
    );

    if (isErr(result)) {
      const handleError = (error: MyErrors): string => {
        switch (error._tag) {
          case "NotFoundError":
            return `Not found: ${error.resourceId} in ${error.database}`;
          case "ValidationError":
            return `Validation failed on ${error.field}`;
          default: {
            // This ensures exhaustive checking - TypeScript will error if we miss a case
            const _exhaustive: never = error;
            return _exhaustive;
          }
        }
      };

      expect(handleError(result.error)).toBe("Not found: 123 in todos");
    }
  });
});
