---
"thinyai": minor
---

Enhance `fetch_url` to support HTTP methods beyond GET. The tool now accepts
optional `method` (POST/PUT/PATCH/DELETE, default GET), `body` (request body
string), and `headers` (custom HTTP headers) parameters. When a body is present
and the caller doesn't set `content-type`, it defaults to `application/json`.

This lets the agent call REST endpoints that require POST directly — no need to
spin up a `delegate_task` sub-agent just to make an HTTP call. The tool was also
extracted to `src/tools/fetch-url.ts` for unit-testability; 6 tests cover GET
defaults, POST + auto content-type, custom headers, and truncation.
