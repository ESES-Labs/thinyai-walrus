import { z } from "zod";
import { defineTool, type Tool } from "@thiny/core";

/**
 * fetch_url — call an http(s) URL and return the response.
 *
 * Supports GET (default) for reading pages and POST/PUT/PATCH/DELETE for
 * calling REST endpoints that require a request body.  This avoids the need
 * to spin up a sub-agent (`delegate_task`) just to make an HTTP call.
 *
 * The tool is **not** marked `sensitive` — it runs in a local CLI with the
 * user's own network access.  Add an SSRF allow-list and policy gate if this
 * ever runs as a hosted / multi-tenant service.
 */
export function createFetchUrlTool(): Tool {
  return defineTool({
    name: "fetch_url",
    description:
      "Call an http(s) URL and return the response (markdown, text, JSON, HTML). ALWAYS use this " +
      "when the user shares a link — e.g. a skill.md, docs page, or an API/MCP endpoint — instead " +
      "of saying you can't open URLs. Defaults to GET (read a page). For REST endpoints that need " +
      "a POST/PUT/PATCH/DELETE, set `method` and pass `body` (a JSON string for JSON APIs). " +
      "Returns the response text (truncated if very large) plus status + content-type.",
    parameters: z.object({
      url: z.string().url().describe("The http(s) URL to fetch."),
      method: z
        .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
        .optional()
        .describe(
          "HTTP method. Default GET. Use POST/PUT/PATCH for REST endpoints that need a body.",
        ),
      body: z
        .string()
        .optional()
        .describe(
          'Request body for POST/PUT/PATCH. Pass a JSON string for JSON APIs (e.g. \'{"key":"val"}\').',
        ),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Extra HTTP headers (e.g. { "authorization": "Bearer …", "content-type": "application/json" }).',
        ),
      maxChars: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Max characters of body to return (default 20000)."),
    }),
    execute: async ({ url, method, body, headers, maxChars }) => {
      const limit = maxChars ?? 20000;
      const httpMethod = method ?? "GET";
      // Merge defaults with caller-supplied headers.
      const reqHeaders: Record<string, string> = {
        "user-agent": "thiny-cli",
        accept: "*/*",
        ...headers,
      };
      // Auto-set content-type for body-bearing requests if the caller didn't.
      if (
        body !== undefined &&
        !Object.keys(reqHeaders).some((k) => k.toLowerCase() === "content-type")
      ) {
        reqHeaders["content-type"] = "application/json";
      }
      const res = await fetch(url, {
        method: httpMethod,
        headers: reqHeaders,
        body: body,
        signal: AbortSignal.timeout(15000),
      });
      const resBody = await res.text();
      return {
        url,
        method: httpMethod,
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        truncated: resBody.length > limit,
        content: resBody.slice(0, limit),
      };
    },
  });
}
