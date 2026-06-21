---
"thinyai": minor
---

Make the CLI installable as a standalone global package: `bun add -g thinyai` (or `npm i -g` /
`pnpm add -g`), command stays `thiny`. The package (renamed from `@thiny/cli` to **`thinyai`**) now
bundles all workspace `@thiny/*` packages into a single self-contained binary via tsup, so it needs
no monorepo or `tsx` at runtime; npm dependencies are declared normally. Onboarding (`thiny`,
`thiny init`, `thiny sui init`) is built into the binary. Verified by installing the packed tarball
into a clean project and running the full agent. The dev launcher (`install.sh` / `pnpm cli`) still
runs the TypeScript sources from a clone.
