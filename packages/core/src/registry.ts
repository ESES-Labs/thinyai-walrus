import type { Tool } from "./tool.js";

export class ToolRegistry {
  private map = new Map<string, Tool>();

  register(tool: Tool): void {
    if (this.map.has(tool.name)) {
      throw new Error(`tool already registered: ${tool.name}`);
    }
    this.map.set(tool.name, tool);
  }

  get(name: string): Tool {
    const t = this.map.get(name);
    if (!t) throw new Error(`unknown tool: ${name}`);
    return t;
  }

  all(): Tool[] {
    return [...this.map.values()];
  }
}
