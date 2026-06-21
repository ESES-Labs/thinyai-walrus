import { describe, it, expect, beforeAll } from "vitest";
import chalk from "chalk";
import { createThinkingWriter, formatTokens } from "../ui.js";

// Force colors so we can assert that think segments are styled (vitest has no TTY).
beforeAll(() => {
  chalk.level = 1;
});

// eslint-disable-next-line no-control-regex
const ANSI = /\x1B\[[0-9;]*m/gu;
const strip = (s: string) => s.replace(ANSI, "");

function collect(chunks: string[]): { writes: string[]; plain: string } {
  const writes: string[] = [];
  const w = createThinkingWriter((s) => writes.push(s));
  for (const c of chunks) w.push(c);
  w.end();
  return { writes, plain: strip(writes.join("")) };
}

describe("createThinkingWriter", () => {
  it("keeps all text (minus the tags) and dims the think segment", () => {
    const { writes, plain } = collect(["Hello <think>reasoning</think> world"]);
    expect(plain).toBe("Hello reasoning world");
    const reasoning = writes.find((w) => strip(w).includes("reasoning"));
    const hello = writes.find((w) => strip(w).includes("Hello"));
    expect(reasoning).toMatch(ANSI); // styled
    expect(hello).not.toMatch(ANSI); // plain answer text
  });

  it("handles tags split across streamed chunks", () => {
    const { plain } = collect(["Hel", "lo <thi", "nk>re", "ason</thi", "nk> wo", "rld"]);
    expect(plain).toBe("Hello reason world");
  });

  it("passes through text with no think tags unchanged", () => {
    const { writes, plain } = collect(["just an answer"]);
    expect(plain).toBe("just an answer");
    expect(writes.join("")).not.toMatch(ANSI);
  });
});

describe("formatTokens", () => {
  it("abbreviates thousands", () => {
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1497)).toBe("1.5k");
  });
});
