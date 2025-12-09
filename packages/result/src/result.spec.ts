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
  httpError,
  taggedError,
  type Result,
} from "./index.js";

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

  it("err creates failure result", () => {
    const result = err("error");
    expect(result._tag).toBe("Err");
    expect(result.error).toBe("error");
  });
});

describe("guards", () => {
  it("isOk returns true for Ok", () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    expect(isErr(result)).toBe(false);
  });

  it("isErr returns true for Err", () => {
    const result = err("error");
    expect(isErr(result)).toBe(true);
    expect(isOk(result)).toBe(false);
  });

  it("type narrows correctly", () => {
    const result: Result<string, number> = ok(42);
    if (isOk(result)) {
      const value: number = result.value;
      expect(value).toBe(42);
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
      const result = map(err("error") as Result<string, number>, (x) => x * 2);
      expect(result).toEqual(err("error"));
    });
  });

  describe("flatMap", () => {
    it("chains Ok results", () => {
      const result = flatMap(ok(5), (x) => ok(x * 2));
      expect(result).toEqual(ok(10));
    });

    it("short-circuits on Err", () => {
      const result = flatMap(err("first") as Result<string, number>, (x) => ok(x * 2));
      expect(result).toEqual(err("first"));
    });

    it("returns inner Err", () => {
      const result = flatMap(ok(5), (_x) => err("inner"));
      expect(result).toEqual(err("inner"));
    });
  });

  describe("mapError", () => {
    it("transforms Err value", () => {
      const result = mapError(err("error"), (e) => ({ message: e }));
      expect(result).toEqual(err({ message: "error" }));
    });

    it("passes through Ok", () => {
      const result = mapError(ok(42) as Result<string, number>, (e) => ({ message: e }));
      expect(result).toEqual(ok(42));
    });
  });

  describe("catchError", () => {
    it("recovers from Err", () => {
      const result = catchError(err("error") as Result<string, number>, (_e) => ok(0));
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

    it("throws on Err", () => {
      expect(() => unwrap(err("error"))).toThrow("error");
    });
  });

  describe("unwrapOr", () => {
    it("extracts Ok value", () => {
      expect(unwrapOr(ok(42), 0)).toBe(42);
    });

    it("returns default for Err", () => {
      expect(unwrapOr(err("error") as Result<string, number>, 0)).toBe(0);
    });
  });

  describe("unwrapOrElse", () => {
    it("extracts Ok value", () => {
      expect(unwrapOrElse(ok(42), () => 0)).toBe(42);
    });

    it("computes default for Err", () => {
      expect(unwrapOrElse(err("error") as Result<string, number>, (e) => e.length)).toBe(5);
    });
  });

  describe("getOrUndefined", () => {
    it("returns value for Ok", () => {
      expect(getOrUndefined(ok(42))).toBe(42);
    });

    it("returns undefined for Err", () => {
      expect(getOrUndefined(err("error"))).toBeUndefined();
    });
  });

  describe("getErrorOrUndefined", () => {
    it("returns undefined for Ok", () => {
      expect(getErrorOrUndefined(ok(42))).toBeUndefined();
    });

    it("returns error for Err", () => {
      expect(getErrorOrUndefined(err("error"))).toBe("error");
    });
  });
});

describe("matching", () => {
  describe("match", () => {
    it("calls ok handler for Ok", () => {
      const result = match(ok(42), {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("value: 42");
    });

    it("calls err handler for Err", () => {
      const result = match(err("failed") as Result<string, number>, {
        ok: (v) => `value: ${v}`,
        err: (e) => `error: ${e}`,
      });
      expect(result).toBe("error: failed");
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
        err("error") as Result<string, number>,
        (e) => e.length,
        (v) => v * 2,
      );
      expect(result).toBe(5);
    });
  });
});

describe("async", () => {
  describe("tryCatch", () => {
    it("returns Ok for success", () => {
      const result = tryCatch(
        () => JSON.parse('{"a":1}'),
        () => "parse error",
      );
      expect(result).toEqual(ok({ a: 1 }));
    });

    it("returns Err for failure", () => {
      const result = tryCatch(
        () => JSON.parse("invalid"),
        () => "parse error",
      );
      expect(result).toEqual(err("parse error"));
    });
  });

  describe("tryCatchAsync", () => {
    it("returns Ok for success", async () => {
      const result = await tryCatchAsync(
        async () => 42,
        () => "error",
      );
      expect(result).toEqual(ok(42));
    });

    it("returns Err for failure", async () => {
      const result = await tryCatchAsync(
        async () => {
          throw new Error("failed");
        },
        () => "error",
      );
      expect(result).toEqual(err("error"));
    });
  });

  describe("fromPromise", () => {
    it("returns Ok for resolved promise", async () => {
      const result = await fromPromise(Promise.resolve(42), () => "error");
      expect(result).toEqual(ok(42));
    });

    it("returns Err for rejected promise", async () => {
      const result = await fromPromise(Promise.reject(new Error("failed")), () => "error");
      expect(result).toEqual(err("error"));
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
      const result = all([ok(1), err("error"), ok(3)] as Result<string, number>[]);
      expect(result).toEqual(err("error"));
    });

    it("handles empty array", () => {
      const result = all([]);
      expect(result).toEqual(ok([]));
    });
  });

  describe("firstOk", () => {
    it("returns first Ok", () => {
      const result = firstOk([err("a"), ok(1), err("b")] as Result<string, number>[]);
      expect(result).toEqual(ok(1));
    });

    it("collects all errors if no Ok", () => {
      const result = firstOk([err("a"), err("b")]);
      expect(result).toEqual(err(["a", "b"]));
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
      const result = tap(err("error") as Result<string, number>, (v) => {
        sideEffect = v;
      });
      expect(result).toEqual(err("error"));
      expect(sideEffect).toBe(0);
    });
  });

  describe("tapError", () => {
    it("runs side effect for Err", () => {
      let sideEffect = "";
      const result = tapError(err("error"), (e) => {
        sideEffect = e;
      });
      expect(result).toEqual(err("error"));
      expect(sideEffect).toBe("error");
    });

    it("skips side effect for Ok", () => {
      let sideEffect = "";
      const result = tapError(ok(42) as Result<string, number>, (e) => {
        sideEffect = e;
      });
      expect(result).toEqual(ok(42));
      expect(sideEffect).toBe("");
    });
  });
});

describe("error helpers", () => {
  describe("httpError", () => {
    it("creates tagged HTTP error", () => {
      const error = httpError(404, { message: "Not found" });
      expect(error).toEqual({
        _httpCode: 404,
        data: { message: "Not found" },
      });
    });
  });

  describe("taggedError", () => {
    it("creates error with both codes", () => {
      const error = taggedError(1001, 400, { message: "Validation failed" });
      expect(error).toEqual({
        _code: 1001,
        _httpCode: 400,
        data: { message: "Validation failed" },
      });
    });
  });
});
