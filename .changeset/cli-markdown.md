---
"@thiny/cli": patch
---

Render markdown in the chat output (like Claude Code / opencode): **bold**, *italic*, `inline code`,
~~strikethrough~~, headings, bullet/numbered lists, blockquotes, horizontal rules, fenced code
blocks (kept verbatim), and `[links](url)` as clickable terminal hyperlinks. The streaming writer
buffers the answer per line so markers split across token chunks still render correctly, while
`<think>…</think>` reasoning keeps streaming live and dimmed.
