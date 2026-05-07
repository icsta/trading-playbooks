# Manual Smoke Test Checklist

Run before declaring a release-quality build. Requires the `claude` CLI on PATH and an active Max/Pro subscription. Cockpit uses one-shot `claude -p` subprocess per message — no interactive permission prompts in this build.

## Setup
- [ ] `pnpm install`
- [ ] `cp .env.local.example .env.local` and edit if needed
- [ ] `pnpm test` — all unit/integration tests pass

## Server boot
- [ ] `pnpm dev` starts without error
- [ ] Server logs `[cockpit] http://127.0.0.1:3000  (project: /Users/justin/Code/trading-playbooks)`
- [ ] `curl -s http://127.0.0.1:3000/` returns the HTML shell
- [ ] `lsof -i :3000` shows binding to 127.0.0.1 only — NOT 0.0.0.0

## Chat — basic
- [ ] Open `http://localhost:3000`, click ☰ to reveal the sidebar
- [ ] Click "+ New chat" if a session was already loaded
- [ ] Send "What is 2+2?" — assistant turn arrives as a whole message and renders
- [ ] Session appears in drawer with auto-title "What is 2+2?"

## Chat — tool calls
- [ ] Send "Read `CLAUDE.md` and summarize in one sentence."
- [ ] Tool-call block appears (collapsed) showing `Read · CLAUDE.md`
- [ ] Click to expand → shows args and result
- [ ] Final summary text streams in below

## Chat — denied tool calls
- [ ] Send a prompt that would invoke a tool not in your `~/.claude/settings.json` allowlist (e.g. ask Claude to use a niche tool that requires permission).
- [ ] When claude attempts the tool: the tool-call block renders with a red border and an "error" badge.
- [ ] Once the assistant turn ends, a yellow banner at the bottom of the assistant message lists the denied tool name(s).

## Sessions — resume
- [ ] Send a message in session A
- [ ] Click "+ New chat" → drawer shows two sessions
- [ ] Click session A → sidebar highlights it; the chat pane currently shows nothing (transcript replay is a deferred feature)
- [ ] Send another message in session A → claude responds with the prior context preserved (because we pass `--resume <id>`)

## Sessions — restart persistence
- [ ] Stop server (Ctrl-C)
- [ ] `pnpm dev`
- [ ] Drawer still shows previous sessions (read from SQLite at `web/data/cockpit.db`)
- [ ] Click an old session, send a message — context preserved (claude remembers prior conversation)

## Files tab
- [ ] Click "Files" tab in the right pane
- [ ] Listing shows `outputs/` (folder) and `watchlist.md` (file). Hidden files like `.DS_Store` are filtered out.
- [ ] Click `watchlist.md` → renders with a "back" button at top
- [ ] Click back → returns to listing
- [ ] Navigate `outputs/F/` (or any ticker folder you have) → reports listed → click one → renders
- [ ] Back stack works at every depth

## Files tab — security
- [ ] In devtools console:
  - `await fetch('/api/files?path=..').then(r => r.status)` → `403`
  - `await fetch('/api/files/content?path=secret.csv').then(r => r.status)` → `403` (or `404` if no such file outside the sandbox)
  - `await fetch('/api/files/content?path=/etc/passwd').then(r => r.status)` → `403`

## Visualization tab
- [ ] Click "Visualization" tab → placeholder reads "Charts will render here when a future skill emits them."

## Multi-tab lock
- [ ] Open the same session in two browser tabs
- [ ] First tab works normally
- [ ] Second tab attempts subscribe → check the browser console for `[ws error] session_in_use`

## Hang behavior
- [ ] (Optional) Send a prompt that would take a very long time. The hang timer (60s by default) will SIGTERM the subprocess if it goes silent for that long.

## Shutdown
- [ ] Ctrl-C in dev terminal → server logs "shutting down…" and exits cleanly
- [ ] No zombie `claude` processes (`ps aux | grep claude`)
