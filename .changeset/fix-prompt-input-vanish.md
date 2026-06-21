---
"thinyai": patch
---

Fix the user's typed message disappearing after pressing Enter. The raw-mode prompt's finish step did
`\r\x1b[0J`, which jumped to the start of the input line and erased it before printing the response.
It now clears only the dropdown below and keeps the `You › …` line on screen.
