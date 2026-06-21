/**
 * A small raw-mode input line with a live slash-command palette (filter-as-you-type, arrow-select,
 * Enter to run) — like Claude Code / opencode. Node's readline can't render a dropdown, so this owns
 * the input line + the menu below it. Falls back gracefully on non-TTY input (piped/tests).
 */
import { emitKeypressEvents } from "node:readline";
import chalk from "chalk";

export interface SlashCommand {
  name: string; // includes the leading slash, e.g. "/connect"
  desc: string;
}

interface KeyInfo {
  name?: string;
  ctrl?: boolean;
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/g;
const visLen = (s: string): number => s.replace(ANSI, "").length;

const MAX_ROWS = 8;

export class SlashPrompt {
  private buf = "";
  private sel = 0;
  private rows = 0; // menu rows currently drawn below the input line
  private onKey?: (str: string | undefined, key: KeyInfo | undefined) => void;
  private resolver?: (v: string | null) => void;
  private curPrompt: string;

  constructor(
    private readonly stdin: NodeJS.ReadStream,
    private readonly stdout: NodeJS.WriteStream,
    private readonly basePrompt: string,
    private readonly commands: SlashCommand[],
  ) {
    this.curPrompt = basePrompt;
    emitKeypressEvents(stdin);
  }

  private width(): number {
    return this.stdout.columns || 80;
  }

  private matches(): SlashCommand[] {
    if (!this.buf.startsWith("/") || this.buf.includes(" ")) return [];
    const q = this.buf.slice(1).toLowerCase();
    return this.commands.filter((c) => c.name.slice(1).toLowerCase().startsWith(q));
  }

  /** Redraw the input line + the dropdown, leaving the cursor at the end of the typed text. */
  private draw(): void {
    const ms = this.matches();
    if (this.sel >= ms.length) this.sel = Math.max(0, ms.length - 1);
    this.stdout.write("\r\x1b[0J"); // to col 0, clear input line + everything below
    let out = this.curPrompt + this.buf;
    const shown = ms.slice(0, MAX_ROWS);
    const w = this.width();
    for (let i = 0; i < shown.length; i++) {
      const c = shown[i];
      if (!c) continue;
      const name = c.name.padEnd(18);
      const descMax = Math.max(10, w - 24);
      const desc = c.desc.length > descMax ? `${c.desc.slice(0, descMax - 1)}…` : c.desc;
      out +=
        "\n" +
        (i === this.sel
          ? chalk.bgCyan.black(` ${name} `) + " " + chalk.dim(desc)
          : "  " + chalk.cyan(name) + " " + chalk.dim(desc));
    }
    this.stdout.write(out);
    this.rows = shown.length;
    if (this.rows > 0) this.stdout.write(`\x1b[${String(this.rows)}A`); // back up to the input line
    const col = visLen(this.curPrompt) + this.buf.length;
    this.stdout.write("\r" + (col > 0 ? `\x1b[${String(col)}C` : ""));
  }

  private finish(value: string | null): void {
    if (this.onKey) this.stdin.off("keypress", this.onKey);
    this.onKey = undefined;
    if (this.rows > 0) this.stdout.write(`\x1b[${String(this.rows)}B`); // move below the menu
    this.stdout.write("\r\x1b[0J\n"); // clear, then a clean newline
    this.rows = 0;
    const r = this.resolver;
    this.resolver = undefined;
    r?.(value);
  }

  private handle(str: string | undefined, key: KeyInfo | undefined): void {
    const name = key?.name;
    if (key?.ctrl && name === "c") {
      this.stdout.write("\n");
      process.exit(0);
    }
    if (key?.ctrl && name === "d") {
      if (this.buf === "") this.finish(null);
      return;
    }
    if (name === "return" || name === "enter") {
      const ms = this.matches();
      const menuOpen = this.buf.startsWith("/") && ms.length > 0;
      const chosen = ms[this.sel];
      this.finish(menuOpen && chosen ? chosen.name : this.buf);
      return;
    }
    if (name === "escape") {
      this.buf = "";
      this.sel = 0;
      this.draw();
      return;
    }
    if (name === "backspace") {
      this.buf = this.buf.slice(0, -1);
      this.sel = 0;
      this.draw();
      return;
    }
    if (name === "up" || name === "down") {
      const n = this.matches().length;
      if (n > 0) {
        this.sel = name === "up" ? (this.sel - 1 + n) % n : (this.sel + 1) % n;
        this.draw();
      }
      return;
    }
    if (name === "tab") {
      const chosen = this.matches()[this.sel];
      if (chosen) {
        this.buf = chosen.name;
        this.draw();
      }
      return;
    }
    if (str && !key?.ctrl) {
      // printable char(s) — including a pasted burst; strip newlines.
      const clean = str.replace(/[\r\n]/g, "");
      if (clean && (clean.length > 1 || clean.charCodeAt(0) >= 32)) {
        this.buf += clean;
        this.sel = 0;
        this.draw();
      }
    }
  }

  /** Read one line. `promptOverride` swaps the prompt text (for sub-questions); null = EOF (Ctrl-D). */
  readLine(promptOverride?: string): Promise<string | null> {
    this.curPrompt = promptOverride ?? this.basePrompt;
    this.buf = "";
    this.sel = 0;
    this.rows = 0;
    if (this.stdin.isTTY) this.stdin.setRawMode(true);
    this.stdin.resume();
    this.draw();
    return new Promise((resolve) => {
      this.resolver = resolve;
      const handler = (s: string | undefined, k: KeyInfo | undefined): void => {
        this.handle(s, k);
      };
      this.onKey = handler;
      this.stdin.on("keypress", handler);
    });
  }

  /** True while actively awaiting a line (so callers can choose to print-above vs queue). */
  isReading(): boolean {
    return this.resolver !== undefined;
  }

  /** Print something above the live prompt (e.g. an async notice) without disturbing the input. */
  printAbove(fn: () => void): void {
    if (!this.resolver) {
      fn();
      return;
    } // not currently prompting
    this.stdout.write("\r\x1b[0J"); // clear input + menu (cursor is on the input line)
    fn();
    this.draw();
  }

  close(): void {
    if (this.onKey) this.stdin.off("keypress", this.onKey);
    if (this.stdin.isTTY) this.stdin.setRawMode(false);
  }
}
