/**
 * Terminal UI rendering for the Thiny CLI.
 * All UI output goes to stdout. All logs go to stderr (via pinoLogger({ stderr: true })).
 */
import figlet from "figlet";
import chalk from "chalk";

// Theme

const BRAND = chalk.cyan;
const DIM = chalk.dim;
const AGENT_LABEL = BRAND.bold;
const ERROR_COLOR = chalk.red;
const SUCCESS_COLOR = chalk.green;

// Helpers

export function getWidth(): number {
  return process.stdout.columns || 80;
}

// Strip ANSI escape sequences to compute visible (rendered) string length.
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1B\[[0-9;]*m/g;
const visibleLen = (s: string) => s.replace(ANSI_REGEX, "").length;

function padRight(str: string, len: number): string {
  return str + " ".repeat(Math.max(0, len - visibleLen(str)));
}

function center(str: string, width: number): string {
  const pad = Math.max(0, Math.floor((width - visibleLen(str)) / 2));
  return " ".repeat(pad) + str;
}

// ASCII art header

export function renderHeader(opts: {
  model: string;
  session: string;
  persona?: string;
  version?: string;
}): void {
  const w = getWidth();

  // ASCII art title
  let title: string;
  try {
    title = figlet.textSync(opts.persona ?? "Thiny", { font: "Standard" });
  } catch {
    title = opts.persona ?? "Thiny";
  }

  process.stdout.write("\n");

  // Print title lines centered and colored (cyan)
  for (const line of title.split("\n")) {
    if (line.trim()) process.stdout.write(center(BRAND.bold(line), w) + "\n");
  }

  process.stdout.write("\n");

  // Info bar
  const version = opts.version ?? "v0.1.0";
  const infoText = ` ${opts.persona ?? "Thiny"} Agent ${version} `;
  const remaining = Math.max(0, w - visibleLen(infoText));
  const leftDash = "─".repeat(Math.floor(remaining / 2));
  const rightDash = "─".repeat(remaining - leftDash.length);
  process.stdout.write(BRAND(leftDash) + BRAND.bold(infoText) + BRAND(rightDash) + "\n\n");
}

// Tools + Skills panel

export interface PanelEntry {
  label: string;
  value: string;
}

export function renderToolsAndSkills(
  tools: string[],
  skills: Map<string, string[]>,
  opts: { model: string; session: string; persona?: string },
): void {
  const w = getWidth();
  
  // Left column width: 25 columns
  const leftColW = 25;
  const leftLines: string[] = [
    "",
    center(BRAND.bold(opts.persona ?? "Thiny"), leftColW),
    center(DIM(opts.model.slice(0, leftColW - 2)), leftColW),
    center(DIM(`Session: ${opts.session.slice(-8)}`), leftColW),
  ];

  // Right column lines
  const toolGroups = new Map<string, string[]>();
  for (const tool of tools) {
    const idx = tool.indexOf("_");
    const prefix = idx !== -1 ? tool.slice(0, idx) : "core";
    const list = toolGroups.get(prefix) ?? [];
    list.push(tool);
    toolGroups.set(prefix, list);
  }

  const rightLines: string[] = [];
  rightLines.push(BRAND.bold("Available Tools"));
  for (const [prefix, names] of toolGroups) {
    rightLines.push(`  ${BRAND(prefix)}: ${names.join(", ")}`);
  }
  rightLines.push("");
  rightLines.push(BRAND.bold("Available Skills"));
  
  if (skills.size === 0) {
    rightLines.push(`  ${DIM("(none loaded — use --skills <id>)")}`);
  } else {
    for (const [cat, names] of skills) {
      rightLines.push(`  ${BRAND(cat)}: ${names.join(", ")}`);
    }
  }

  // Draw side-by-side
  const maxLines = Math.max(leftLines.length, rightLines.length);
  
  // Draw border top
  process.stdout.write(BRAND("┌" + "─".repeat(w - 2) + "┐") + "\n");

  for (let i = 0; i < maxLines; i++) {
    const leftRaw = leftLines[i] ?? "";
    const rightRaw = rightLines[i] ?? "";

    // pad left column to leftColW
    const leftPad = padRight(leftRaw, leftColW);
    
    // spacing between left and right column
    const spacer = BRAND(" │ ");
    
    // pad right column to fill remaining space
    const rightColW = w - leftColW - 7; // 2 borders (┌/┐) + 3 spacer ( │ ) = 5 plus margin
    const rightPad = padRight(rightRaw, rightColW);

    process.stdout.write(BRAND("│ ") + leftPad + spacer + rightPad + BRAND(" │") + "\n");
  }

  // Draw border bottom
  process.stdout.write(BRAND("└" + "─".repeat(w - 2) + "┘") + "\n");
}

// Hints bar

export function renderHints(logFile?: string): void {
  const logHint = logFile ? `  ·  ${DIM("logs →")} ${chalk.dim(logFile)}` : "";
  process.stdout.write(
    "\n" +
      DIM("Type a message  ·  ") +
      DIM("/new") +
      chalk.dim(" new session  ·  ") +
      DIM("/skills") +
      chalk.dim(" list skills  ·  ") +
      DIM("/tools") +
      chalk.dim(" list tools  ·  ") +
      DIM("Ctrl+C") +
      chalk.dim(" quit") +
      logHint +
      "\n\n",
  );
}

// Message formatting

export function renderAgentLabel(name: string): void {
  // The user's turn is the `You › …` prompt echo itself — no need to re-render it as a block.
  process.stdout.write("\n" + AGENT_LABEL(name) + "\n");
}

export function renderAgentDone(): void {
  process.stdout.write("\n");
}

export function renderToolCall(toolName: string, status: "start" | "done" | "error"): void {
  const icons = { start: "⚙", done: "✓", error: "✗" };
  const colors = { start: chalk.yellow, done: chalk.green, error: chalk.red };
  process.stdout.write(DIM(`  ${icons[status]} `) + colors[status](toolName) + "\n");
}

export function renderError(message: string): void {
  process.stdout.write("\n" + ERROR_COLOR("Error: ") + chalk.white(message) + "\n");
}

export function renderInfo(message: string): void {
  process.stdout.write(DIM(message) + "\n");
}

export function renderSuccess(message: string): void {
  process.stdout.write(SUCCESS_COLOR("✓ ") + chalk.white(message) + "\n");
}

export function renderWarning(message: string): void {
  process.stdout.write(chalk.yellow("⚠ ") + chalk.white(message) + "\n");
}

// Spinner

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export class Spinner {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameIdx = 0;

  start(label: string): void {
    this.stop();
    process.stdout.write("\n");
    this.intervalId = setInterval(() => {
      const frame = SPINNER_FRAMES[this.frameIdx % SPINNER_FRAMES.length] ?? "⠋";
      process.stdout.write(`\r  ${BRAND(frame)} ${DIM(label)}   `);
      this.frameIdx++;
    }, 80);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      process.stdout.write("\r" + " ".repeat(40) + "\r");
    }
  }
}

export function clearScreen(): void {
  process.stdout.write("\x1Bc");
}

// Stats + status line

/** Compact token count: 1234 → "1.2k", 980 → "980". */
export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** A subtle dim status line under a response: `model · 5.1s · ↑1.5k ↓152 · 2 tools`. */
export function renderStatus(parts: string[]): void {
  const shown = parts.filter((p) => p.length > 0);
  if (shown.length === 0) return;
  process.stdout.write(DIM(`  ${shown.join("  ·  ")}`) + "\n");
}

// Walrus "stored" block — compact + dim, with clickable explorer links

export interface StoredLinks {
  blob: string;
  tx?: string;
  object?: string;
}

export function renderStored(label: string, links: StoredLinks, backend = "Walrus"): void {
  // One compact, verifiable line — the walruscan blob link is enough to inspect/verify the write.
  process.stdout.write(
    SUCCESS_COLOR("  ✓ ") + DIM(`${label} on ${backend}  ·  `) + chalk.dim.underline(links.blob) + "\n",
  );
}

/** A dim "saving…" hint shown while a background write is still in flight. */
export function renderSaving(label: string, backend = "Walrus"): void {
  process.stdout.write(DIM(`  ⟳ saving ${label} to ${backend}…`) + "\n");
}

// Streaming writer that dims `<think>…</think>` reasoning (handles tags split across chunks)

const THINK_OPEN = "<think>";
const THINK_CLOSE = "</think>";

/** Longest suffix of `s` that is a proper prefix of any tag — held back until the next chunk. */
function pendingTagLen(s: string): number {
  let max = 0;
  for (const tag of [THINK_OPEN, THINK_CLOSE]) {
    for (let n = Math.min(s.length, tag.length - 1); n > 0; n--) {
      if (s.endsWith(tag.slice(0, n))) {
        if (n > max) max = n;
        break;
      }
    }
  }
  return max;
}

export interface StreamWriter {
  push(delta: string): void;
  end(): void;
}

/**
 * Wrap raw stdout writes so model `<think>…</think>` reasoning renders dim+italic (like Claude Code),
 * while the answer renders normally. Robust to tags arriving split across streamed chunks.
 */
export function createThinkingWriter(write: (s: string) => void): StreamWriter {
  let inThink = false;
  let buf = "";
  const emit = (text: string): void => {
    if (text.length > 0) write(inThink ? chalk.dim.italic(text) : text);
  };
  const drain = (): void => {
    for (;;) {
      const open = buf.indexOf(THINK_OPEN);
      const close = buf.indexOf(THINK_CLOSE);
      const present = [open, close].filter((i) => i !== -1);
      if (present.length === 0) break;
      const idx = Math.min(...present);
      const isOpen = idx === open;
      emit(buf.slice(0, idx));
      inThink = isOpen;
      buf = buf.slice(idx + (isOpen ? THINK_OPEN.length : THINK_CLOSE.length));
    }
    const hold = pendingTagLen(buf);
    emit(buf.slice(0, buf.length - hold));
    buf = buf.slice(buf.length - hold);
  };
  return {
    push: (delta) => {
      buf += delta;
      drain();
    },
    end: () => {
      emit(buf);
      buf = "";
    },
  };
}
