import { describe, it, expect } from "vitest";
import { jsonSchemaToZod } from "../schema.js";

describe("jsonSchemaToZod", () => {
  it("converts an object schema with required and optional fields", () => {
    const schema = jsonSchemaToZod({
      type: "object",
      properties: {
        path: { type: "string" },
        depth: { type: "integer" },
      },
      required: ["path"],
    });
    expect(schema.safeParse({ path: "/a" }).success).toBe(true);
    expect(schema.safeParse({ path: "/a", depth: 3 }).success).toBe(true);
    expect(schema.safeParse({ depth: 3 }).success).toBe(false); // missing required
  });

  it("converts primitive types", () => {
    expect(jsonSchemaToZod({ type: "string" }).safeParse("hello").success).toBe(true);
    expect(jsonSchemaToZod({ type: "number" }).safeParse(42).success).toBe(true);
    expect(jsonSchemaToZod({ type: "integer" }).safeParse(1).success).toBe(true);
    expect(jsonSchemaToZod({ type: "boolean" }).safeParse(true).success).toBe(true);
  });

  it("converts array schema", () => {
    const schema = jsonSchemaToZod({ type: "array", items: { type: "string" } });
    expect(schema.safeParse(["a", "b"]).success).toBe(true);
    expect(schema.safeParse([1]).success).toBe(false);
  });

  it("falls back to z.unknown() for undefined or unsupported schemas", () => {
    expect(jsonSchemaToZod(undefined).safeParse(42).success).toBe(true);
    expect(jsonSchemaToZod(undefined).safeParse("x").success).toBe(true);
  });
});
