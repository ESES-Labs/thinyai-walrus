import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/bin.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: false,
  splitting: false,
  // Bundle the workspace @thiny/* packages INTO the binary so the published package is
  // self-contained (installable via `bun add -g thinyai` with no workspace). npm deps stay
  // external and are declared in package.json — node resolves them at runtime.
  noExternal: [/^@thiny\//],
  external: ["@mysten-incubation/memwal", "@xenova/transformers"], // optional / loaded dynamically
  banner: {
    js: "#!/usr/bin/env node",
  },
  esbuildOptions(options) {
    options.platform = "node";
  },
});
