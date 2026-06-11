import { describe, it, expect, vi } from "vitest";
import { otelTracingPlugin } from "../index.js";
import { EventBus } from "@thiny/core";
import { trace } from "@opentelemetry/api";

describe("otelTracingPlugin", () => {
  it("subscribes to EventBus events and initiates spans", async () => {
    const mockSpan = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
    };
    const mockTracer = {
      startSpan: vi.fn().mockReturnValue(mockSpan),
    };
    const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer as any);

    const plugin = otelTracingPlugin({ tracerName: "test-tracer" });
    const events = new EventBus();
    const mockCtx = { events };

    if (plugin.setup) {
      await plugin.setup(mockCtx as any);
    }

    events.emit("onStart", { sessionId: "session_1" });
    expect(mockTracer.startSpan).toHaveBeenCalledWith("agent_run", expect.any(Object));

    events.emit("beforeModelCall", { step: 0 });
    expect(mockTracer.startSpan).toHaveBeenCalledWith("model_call:step_0");

    events.emit("afterModelCall", { step: 0 });
    expect(mockSpan.end).toHaveBeenCalled();

    getTracerSpy.mockRestore();
  });

  it("records tool call spans with correct attributes", async () => {
    const mockSpan = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
    };
    const mockTracer = {
      startSpan: vi.fn().mockReturnValue(mockSpan),
    };
    const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer as any);

    const plugin = otelTracingPlugin();
    const events = new EventBus();
    const mockCtx = { events };

    if (plugin.setup) {
      await plugin.setup(mockCtx as any);
    }

    events.emit("onStart", { sessionId: "session_1" });
    events.emit("beforeToolCall", { call: { id: "call_1", name: "send_eth", args: { to: "0xabc", value: "0.1" } } });

    const toolCallArgs = (mockTracer.startSpan as any).mock.calls.find(
      (c: any[]) => c[0] === "tool_call:send_eth",
    );

    expect(toolCallArgs).toBeDefined();
    if (toolCallArgs) {
      const attrs = toolCallArgs[1]?.attributes;
      expect(attrs?.["thiny.tool.name"]).toBe("send_eth");
      expect(attrs?.["thiny.tool.id"]).toBe("call_1");
    }

    getTracerSpy.mockRestore();
  });

  it("records exceptions and sets error status on tool errors", async () => {
    const mockSpan = {
      end: vi.fn(),
      setAttribute: vi.fn(),
      recordException: vi.fn(),
      setStatus: vi.fn(),
    };
    const mockTracer = {
      startSpan: vi.fn().mockReturnValue(mockSpan),
    };
    const getTracerSpy = vi.spyOn(trace, "getTracer").mockReturnValue(mockTracer as any);

    const plugin = otelTracingPlugin();
    const events = new EventBus();
    const mockCtx = { events };

    if (plugin.setup) {
      await plugin.setup(mockCtx as any);
    }

    events.emit("onStart", { sessionId: "test" });
    events.emit("beforeToolCall", { call: { id: "err_call", name: "bad_tool", args: {} } });
    events.emit("onError", { call: { id: "err_call", name: "bad_tool", args: {} }, error: "Something broke" });

    expect(mockSpan.recordException).toHaveBeenCalled();
    expect(mockSpan.setStatus).toHaveBeenCalled();

    getTracerSpy.mockRestore();
  });

  it("creates a valid plugin in no-op path when OTel is not configured", () => {
    // Even without a real OTel SDK, the plugin should create successfully
    // using the no-op API that ships with @opentelemetry/api
    const plugin = otelTracingPlugin();
    expect(plugin.name).toBe("otel-tracing");
    expect(plugin.setup).toBeTypeOf("function");
  });
});
