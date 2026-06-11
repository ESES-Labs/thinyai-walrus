import { describe, it, expect } from "vitest";
import { jsonSchemaToZod } from "../schema.js";

describe("jsonSchemaToZod — property tests", () => {
  describe("string", () => {
    it("converts basic string schema", () => {
      const zod = jsonSchemaToZod({ type: "string" });
      expect(zod.parse("hello")).toBe("hello");
      expect(() => zod.parse(42)).toThrow();
    });

    it("handles string with enum", () => {
      const zod = jsonSchemaToZod({ type: "string", enum: ["a", "b", "c"] });
      expect(zod.parse("a")).toBe("a");
      expect(() => zod.parse("d")).toThrow();
    });
  });

  describe("number", () => {
    it("converts basic number schema", () => {
      const zod = jsonSchemaToZod({ type: "number" });
      expect(zod.parse(42)).toBe(42);
      expect(() => zod.parse("not-a-number")).toThrow();
    });

    it("handles integer type", () => {
      const zod = jsonSchemaToZod({ type: "integer" });
      expect(zod.parse(42)).toBe(42);
      // integer type parses as number
      expect(zod.parse(3)).toBe(3); // integer type coerced to number
    });
  });

  describe("boolean", () => {
    it("converts boolean schema", () => {
      const zod = jsonSchemaToZod({ type: "boolean" });
      expect(zod.parse(true)).toBe(true);
      expect(zod.parse(false)).toBe(false);
      expect(() => zod.parse("true")).toThrow();
    });
  });

  describe("array", () => {
    it("converts array of strings", () => {
      const zod = jsonSchemaToZod({ type: "array", items: { type: "string" } });
      expect(zod.parse(["a", "b"])).toEqual(["a", "b"]);
      expect(() => zod.parse([1, 2])).toThrow();
    });

    it("converts array of numbers", () => {
      const zod = jsonSchemaToZod({ type: "array", items: { type: "number" } });
      expect(zod.parse([1, 2, 3])).toEqual([1, 2, 3]);
      expect(() => zod.parse(["a", "b"])).toThrow();
    });
  });

  describe("object", () => {
    it("converts object with properties", () => {
      const zod = jsonSchemaToZod({
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name"],
      });

      expect(zod.parse({ name: "Alice", age: 30 })).toEqual({ name: "Alice", age: 30 });
      // Missing required field
      expect(() => zod.parse({ age: 30 })).toThrow();
      // Optional field can be omitted
      expect(zod.parse({ name: "Bob" })).toEqual({ name: "Bob" });
    });

    it("handles nested objects", () => {
      const zod = jsonSchemaToZod({
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
              address: {
                type: "object",
                properties: {
                  city: { type: "string" },
                },
                required: ["city"],
              },
            },
            required: ["name"],
          },
        },
        required: ["user"],
      });

      const valid = { user: { name: "Alice", address: { city: "NYC" } } };
      expect(zod.parse(valid)).toEqual(valid);

      // Missing nested required field
      expect(() => zod.parse({ user: { name: "Alice", address: {} } })).toThrow();
    });

    it("handles optional properties", () => {
      const zod = jsonSchemaToZod({
        type: "object",
        properties: {
          name: { type: "string" },
          bio: { type: "string" },
        },
        required: ["name"],
      });

      expect(zod.parse({ name: "Alice" })).toEqual({ name: "Alice" });
      expect(zod.parse({ name: "Bob", bio: "Hello" })).toEqual({ name: "Bob", bio: "Hello" });
    });
  });

  describe("round-trip", () => {
    it("string round-trip", () => {
      const zod = jsonSchemaToZod({ type: "string" });
      expect(zod.parse("test-value")).toBe("test-value");
    });

    it("number round-trip", () => {
      const zod = jsonSchemaToZod({ type: "number" });
      expect(zod.parse(3.14)).toBe(3.14);
    });

    it("boolean round-trip", () => {
      const zod = jsonSchemaToZod({ type: "boolean" });
      expect(zod.parse(false)).toBe(false);
    });

    it("complex nested round-trip", () => {
      const schema = {
        type: "object" as const,
        properties: {
          items: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                id: { type: "number" as const },
                label: { type: "string" as const },
                active: { type: "boolean" as const },
              },
              required: ["id", "label"],
            },
          },
        },
        required: ["items"],
      };

      const zod = jsonSchemaToZod(schema);
      const value = {
        items: [
          { id: 1, label: "first", active: true },
          { id: 2, label: "second", active: false },
        ],
      };

      expect(zod.parse(value)).toEqual(value);
    });

    it("empty object round-trip", () => {
      const zod = jsonSchemaToZod({ type: "object", properties: {} });
      expect(zod.parse({})).toEqual({});
    });

    it("empty array round-trip", () => {
      const zod = jsonSchemaToZod({ type: "array", items: { type: "string" } });
      expect(zod.parse([])).toEqual([]);
    });
  });
});
