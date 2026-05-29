import { z } from "zod";

/**
 * Subset of JSON Schema that MCP tools typically use.
 * Only the fields we handle in `jsonSchemaToZod` need to be typed.
 */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  enum?: unknown[];
  description?: string;
}

/**
 * Convert a JSON Schema (as returned by MCP's `listTools`) into a Zod schema.
 *
 * Handles the common subset used by real MCP servers:
 * `string`, `number`, `integer`, `boolean`, `array`, `object`.
 *
 * Falls back to `z.unknown()` for unsupported or missing schemas — this is
 * intentional: it is better to pass the model unknown data than to throw
 * at registration time because of an unsupported schema shape.
 *
 * @param schema - The JSON Schema to convert. May be undefined.
 */
export function jsonSchemaToZod(schema: JsonSchema | undefined): z.ZodType {
  if (!schema?.type) return z.unknown();

  switch (schema.type) {
    case "string":
      return schema.enum ? z.enum(schema.enum as [string, ...string[]]) : z.string();
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(jsonSchemaToZod(schema.items));
    case "object": {
      const required = new Set(schema.required ?? []);
      const shape: Record<string, z.ZodType> = {};
      for (const [key, prop] of Object.entries(schema.properties ?? {})) {
        const fieldSchema = jsonSchemaToZod(prop);
        shape[key] = required.has(key) ? fieldSchema : fieldSchema.optional();
      }
      return z.object(shape).passthrough();
    }
    default:
      return z.unknown();
  }
}
