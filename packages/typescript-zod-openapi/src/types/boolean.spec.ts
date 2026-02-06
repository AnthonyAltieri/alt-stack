import { describe, it, expect } from "vitest";
import { convertOpenAPIBooleanToZod } from "./boolean";

describe("convertOpenAPIBooleanToZod", () => {
  it("should convert a boolean schema", () => {
    const result = convertOpenAPIBooleanToZod({ type: "boolean" });
    expect(result).toBe("z.boolean()");
  });

  it("should always return the same result regardless of input", () => {
    const result1 = convertOpenAPIBooleanToZod({ type: "boolean" });
    const result2 = convertOpenAPIBooleanToZod({ type: "boolean" });
    expect(result1).toBe("z.boolean()");
    expect(result2).toBe("z.boolean()");
    expect(result1).toBe(result2);
  });
});

