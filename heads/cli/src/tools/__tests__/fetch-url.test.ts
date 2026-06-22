import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFetchUrlTool } from "../fetch-url.js";

describe("fetch_url tool", () => {
  const tool = createFetchUrlTool();
  const mockFetch = vi.spyOn(globalThis, "fetch" as never) as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("defaults to GET when no method is specified", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response("hello world", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    const result = await tool.execute({ url: "https://example.com/docs" }, {} as never);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://example.com/docs",
      expect.objectContaining({ method: "GET" }),
    );
    expect(result).toMatchObject({
      url: "https://example.com/docs",
      method: "GET",
      status: 200,
      content: "hello world",
      truncated: false,
    });
  });

  it("sends a POST with body and auto-sets content-type to application/json", async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await tool.execute(
      {
        url: "https://api.example.com/v1/widgets",
        method: "POST",
        body: JSON.stringify({ name: "widget-1" }),
      },
      {} as never,
    );

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    expect(init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ name: "widget-1" }),
    });
    expect(init?.headers).toMatchObject({
      "content-type": "application/json",
      "user-agent": "thiny-cli",
    });
    expect(result).toMatchObject({ method: "POST", status: 201 });
  });

  it("respects a caller-supplied content-type header (no auto-overwrite)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("created", { status: 201 }));

    await tool.execute(
      {
        url: "https://api.example.com/upload",
        method: "POST",
        body: "raw-bytes",
        headers: { "content-type": "text/plain" },
      },
      {} as never,
    );

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    expect(init?.headers).toMatchObject({ "content-type": "text/plain" });
  });

  it("merges custom headers with defaults (user-agent preserved unless overridden)", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await tool.execute(
      {
        url: "https://api.example.com/secure",
        method: "GET",
        headers: { authorization: "Bearer secret-token" },
      },
      {} as never,
    );

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    expect(init?.headers).toMatchObject({
      authorization: "Bearer secret-token",
      "user-agent": "thiny-cli",
      accept: "*/*",
    });
  });

  it("truncates content when the body exceeds maxChars", async () => {
    const longBody = "A".repeat(300);
    mockFetch.mockResolvedValueOnce(new Response(longBody, { status: 200 }));

    const result = await tool.execute(
      { url: "https://example.com/big", maxChars: 100 },
      {} as never,
    );

    expect(result).toMatchObject({
      truncated: true,
      content: "A".repeat(100),
    });
  });

  it("does not send a body for GET requests", async () => {
    mockFetch.mockResolvedValueOnce(new Response("ok", { status: 200 }));

    await tool.execute({ url: "https://example.com" }, {} as never);

    const call = mockFetch.mock.calls[0];
    expect(call).toBeDefined();
    const [, init] = call ?? [];
    expect(init?.body).toBeUndefined();
    expect(init?.method).toBe("GET");
  });
});
