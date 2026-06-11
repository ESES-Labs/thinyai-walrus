/**
 * OpenTelemetry SDK bootstrap for the HTTP head.
 *
 * If OTEL_EXPORTER_OTLP_ENDPOINT is set, initializes the OTel SDK
 * with an OTLP HTTP exporter. Otherwise, a no-op tracer is used
 * (zero overhead when disabled).
 */

export async function initOtel(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    // OTel disabled — use no-op (zero cost)
    return;
  }

  try {
    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { OTLPTraceExporter } = await import("@opentelemetry/exporter-trace-otlp-http");

    const sdk = new NodeSDK({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "thiny-daemon",
      traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    });

    // Graceful shutdown
    process.on("SIGTERM", () => {
      sdk.shutdown().catch(() => {});
    });

    await sdk.start();
    console.log(`OTel tracing enabled → ${endpoint}`);
  } catch (err) {
    console.warn("Failed to initialize OTel SDK:", err instanceof Error ? err.message : String(err));
  }
}
