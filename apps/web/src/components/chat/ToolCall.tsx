import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ToolCallInfo } from "../../store/chat.ts";

interface ToolCallProps {
  tool: ToolCallInfo;
}

function safeFormat(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function argsPreview(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: "${String(v).slice(0, 30)}"`)
      .join(", ");
  } catch {
    return raw;
  }
}

export function ToolCall({ tool }: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const preview = argsPreview(tool.args);

  return (
    <div className="my-1 font-mono">
      <button
        onClick={() => {
          setExpanded((v) => !v);
        }}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-[9px] text-muted">⚙</span>
        <span className="text-[10px] text-dim">{tool.name}</span>
        <span className="max-w-[320px] truncate text-[10px] text-muted">({preview})</span>
        {tool.durationMs !== undefined && (
          <span className="ml-auto flex-shrink-0 text-[9px] text-muted">{tool.durationMs}ms</span>
        )}
        {tool.args && <span className="ml-1 text-[9px] text-muted">{expanded ? "▲" : "▼"}</span>}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-1 rounded border border-[#1a1a1a] bg-[#0a0a0a] p-2">
              <div className="mb-1 text-[9px] text-muted">args</div>
              <pre className="whitespace-pre-wrap break-all text-[9px] text-dim">
                {safeFormat(tool.args)}
              </pre>
              {tool.result && (
                <>
                  <div className="mb-1 mt-2 text-[9px] text-muted">result</div>
                  <pre className="whitespace-pre-wrap break-all text-[9px] text-dim">
                    {safeFormat(tool.result)}
                  </pre>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
