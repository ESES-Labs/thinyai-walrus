# Thiny Web Dashboard — Design Spec

**Date:** 2026-05-31  
**Status:** Approved  
**Stack:** React 18 + Vite 5 + pnpm + TypeScript + Tailwind CSS + Framer Motion + Magic UI (selective)

---

## 1. Scope

A single-page dashboard (`apps/web/`) with two views — **Chat** and **Sessions** — connected to the existing `heads/http/` backend via SSE and REST. No landing page, no auth, no marketing.

**Out of scope:** agent config, plugin browser, skill manager, logs view (future phases).

---

## 2. Design Language

**System UI** — the tool demonstrates itself. No decorative gradients, no neon, no glass morphism, no cyberpunk palette.

| Property       | Value                                               |
| -------------- | --------------------------------------------------- |
| Background     | `#0c0c0c` (shell)                                   |
| Surface        | `#111` (tab bar), `#0f0f0f` (strips)                |
| Border         | `#1e1e1e`                                           |
| Text primary   | `#ccc`                                              |
| Text secondary | `#555`                                              |
| Text muted     | `#2a2a2a`                                           |
| Active/accent  | `#fff` (used only for active tab underline)         |
| Status green   | `#22c55e` (model connected indicator)               |
| Font           | `SF Mono`, `Fira Code`, `JetBrains Mono`, monospace |
| Radius         | `3–4px` (sharp, not rounded)                        |
| Animations     | Fast (100–200ms), functional only                   |

**Animation principle:** Framer Motion is used for message entrance (fade + 4px slide-up, 150ms) and tab transition (instant crossfade). Nothing decorative. Magic UI is used for `TypingAnimation` on streaming text and `AnimatedList` for message list — both functional, not decorative.

---

## 3. Architecture

```
apps/web/
  src/
    api/
      agent.ts       — SSE connection to POST /chat, session management
      sessions.ts    — GET /sessions API calls
    components/
      layout/
        TabBar.tsx         — top nav: logo · Chat · Sessions · model status · settings
        SessionStrip.tsx   — session ID, message count, + new button (chat view only)
      chat/
        MessageList.tsx    — AnimatedList wrapper, scroll-to-bottom
        Message.tsx        — user | agent | tool-call variants
        ToolCall.tsx       — inline tool call row (monospace, collapsible detail)
        InputBar.tsx       — full-width input + send
        StreamingCursor.tsx — blinking ▋ appended to partial response
      sessions/
        SessionTable.tsx   — column headers + rows
        SessionRow.tsx     — single session row, click to resume
        SearchBar.tsx      — filter input
    pages/
      ChatPage.tsx       — assembles chat components, owns SSE connection
      SessionsPage.tsx   — fetches + renders session list
    store/
      chat.ts            — Zustand: messages[], currentSessionId, streaming state
      sessions.ts        — Zustand: sessions[], search query
    App.tsx              — React Router tabs (/ = Chat, /sessions = Sessions)
    main.tsx
    index.css            — Tailwind base, custom monospace variables
```

---

## 4. Backend additions (heads/http)

Two new endpoints added to `heads/http/src/main.ts`:

| Method   | Path            | Response                                                       |
| -------- | --------------- | -------------------------------------------------------------- |
| `GET`    | `/sessions`     | `{ sessions: [{ id, messageCount, lastMessage, updatedAt }] }` |
| `DELETE` | `/sessions/:id` | `{ deleted: true }`                                            |
| `POST`   | `/chat`         | SSE stream (already exists)                                    |

The `/sessions` endpoint reads from the SQLite memory backend. Session data is already persisted there — the endpoint just serializes it.

---

## 5. Chat view

### Tab bar

- Fixed height 38px, `bg-[#111]`, `border-b border-[#1e1e1e]`
- Left: `thiny` wordmark (white, 11px, 700 weight) separated by a vertical border
- Tabs: `↵ Chat` and `≡ Sessions` — active tab has `border-b-[#fff]` underline flush to bar bottom, inactive is `text-[#444]`
- Right: green dot + model name (dim) + ⚙ settings icon

### Session strip (chat view only)

- 32px strip below tab bar: `session: <id>` · `N messages` · `+ new` button (right-aligned)
- `+ new` creates a new session ID and clears the message list

### Message list

- `MessageList` uses `AnimatedList` from Magic UI with each item fading + sliding up 4px over 150ms
- Three message variants:
  - **User** — right-aligned, `bg-[#1a1a1a] border border-[#242424]`, `border-radius: 8px 8px 2px 8px`, `text-[#ccc]` 11px
  - **Agent** — left-flush, no bubble, `text-[#888]` 11px, 1.7 line-height; agent name label above in `text-[#666]` 9px
  - **Tool call** — inline row: `⚙ tool_name (args...)` in monospace gray, latency right-aligned; expandable to see full JSON (click toggles, Framer height animation)
- Streaming: final agent message ends with `StreamingCursor` (blinking `▋`, `text-[#444]`) until SSE `done` event; `TypingAnimation` (Magic UI) wraps the partial text

### Input bar

- `border-t border-[#1a1a1a]`, 10px padding
- Input: `bg-[#0f0f0f] border border-[#1e1e1e]` full-width, `›` prefix glyph, placeholder `ask thiny anything...`
- Send: `bg-[#1a1a1a] border border-[#222]`, `⏎` glyph, 10px padding; disabled while streaming
- `Enter` submits; `Shift+Enter` newline

### SSE connection

- On submit: POST `/chat` with `{ input, sessionId }`
- Response: SSE `data: {"type":"delta","text":"..."}` events fed to streaming state
- `data: {"type":"done"}` → clear streaming cursor, mark message complete
- `data: {"type":"error","message":"..."}` → inline error in message list
- On unmount / session change: abort the SSE connection

---

## 6. Sessions view

### Layout

- Same tab bar (Sessions tab active)
- Thin header strip: session count · search bar · `+ new chat` button
- Column headers: `SESSION` · `LAST MESSAGE` · `MSGS` · `DATE` (9px uppercase, `text-[#2a2a2a]`)
- Session rows below, infinite scroll (load more on scroll to bottom)

### Session row

- Grid: `1fr 2fr 80px 80px`
- Active session: `bg-[#0f0f0f]`, green dot prefix on ID
- Past sessions: transparent bg, `hover:bg-[#0e0e0e]`
- ID: monospace `text-[#444]`; Last message: truncated `text-[#333]`; Msgs + Date: `text-[#2a2a2a]`
- Click → navigate to `/` (Chat) and set that sessionId as current

### Search

- Filters rows client-side by session ID and last message preview
- Debounced 200ms

---

## 7. State management (Zustand)

```ts
// chat store
interface ChatStore {
  sessionId: string;
  messages: Message[];
  streaming: boolean;
  partialText: string;
  newSession: () => void;
  addMessage: (msg: Message) => void;
  appendPartial: (delta: string) => void;
  finalizeStreaming: () => void;
}

// sessions store
interface SessionsStore {
  sessions: Session[];
  query: string;
  loading: boolean;
  fetch: () => Promise<void>;
  setQuery: (q: string) => void;
  resumeSession: (id: string) => void;
}
```

---

## 8. Routing

React Router v6, hash routing (no server config needed):

| Route              | View         |
| ------------------ | ------------ |
| `/#/` or `/#/chat` | ChatPage     |
| `/#/sessions`      | SessionsPage |

Tab clicks update the route; browser back/forward works.

---

## 9. Dependencies

| Package                                | Purpose                                           |
| -------------------------------------- | ------------------------------------------------- |
| `react` `react-dom`                    | UI                                                |
| `react-router-dom`                     | Tab routing                                       |
| `framer-motion`                        | Message entrance, tool call expand, tab crossfade |
| `magicui` (selective)                  | `TypingAnimation`, `AnimatedList`                 |
| `zustand`                              | State management                                  |
| `tailwindcss` `autoprefixer` `postcss` | Styling                                           |
| `@vitejs/plugin-react`                 | Vite plugin                                       |
| `typescript`                           | Types                                             |
| `lucide-react`                         | Icons (⚙, minimal usage)                          |

**Not used:** gradients, glow classes, neon colors, glass morphism utilities.

---

## 10. Connection to Thiny backend

The web app is a standalone Vite app in `apps/web/`. It talks to the HTTP head at `localhost:8787` (the existing `pnpm http` server). In development, Vite proxies `/chat` and `/sessions` to `localhost:8787` to avoid CORS.

```ts
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/chat": "http://localhost:8787",
      "/sessions": "http://localhost:8787",
    },
  },
});
```

---

## 11. What is NOT in this spec

- Authentication / user accounts
- Agent configuration UI
- Plugin / skill browser
- Logs view
- Mobile layout (desktop-first, responsive is a stretch goal)
- Dark/light mode toggle (always dark)
