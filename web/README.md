# Trading Cockpit

Local web app for chatting with Claude about your trading research, browsing markdown reports, and (eventually) viewing visualizations — all wired through the `claude` CLI on your Max/Pro subscription.

**Localhost only.** Binds explicitly to `127.0.0.1`. Do not expose to the network — your Max subscription would be usable by anyone who can reach the port.

## Prerequisites
- Node 20+
- `pnpm`
- `claude` CLI on PATH, logged in with a Max or Pro subscription
- macOS (primary target; Linux should work, untested)

## Setup
```bash
cd web
pnpm install
cp .env.local.example .env.local   # tweak ports / paths if desired
pnpm dev
```
Open http://localhost:3000.

## What's where
- `app/`, `components/`, `hooks/`, `stores/` — Next.js 16 App Router frontend (React 19)
- `lib/claude/` — subprocess bridge + stream-json parser (one-shot `claude -p` per message)
- `lib/sessions/` — session manager + SQLite index (`data/cockpit.db`, gitignored)
- `lib/ws/` — WebSocket protocol (zod-validated) + router
- `lib/files/` — sandboxed file browser (outputs/ + watchlist.md only, with traversal guards)
- `server.ts` — custom Node entry mounting Next.js + ws on :3000

## Commands
- `pnpm dev` — start dev server (Next.js dev mode + ws)
- `pnpm build && pnpm start` — production-local build
- `pnpm test` — unit + integration tests (vitest)
- `pnpm test:watch` — interactive

## Architecture (one-shot model)

Each user message spawns a fresh `claude -p --input-format stream-json --output-format stream-json --verbose --resume <id>` subprocess. The subprocess streams whole assistant turns on stdout (init, whole-message assistant envelopes, tool uses, tool results, result); the bridge parses them into typed events, the SessionManager forwards them over WebSocket to the connected client. The subprocess exits naturally after the result event.

Sessions persist via SQLite (`data/cockpit.db`) — one row per claude session id with title and last-touched timestamp. Conversation transcripts are owned by claude itself in `~/.claude/projects/...` and we replay them via `--resume <id>`.

## Permission handling

The cockpit does NOT show interactive Allow/Deny prompts. Tools listed in `~/.claude/settings.json` allowlist run automatically; denied tools surface as a "denied" badge on the tool-call block plus a yellow banner at the bottom of the assistant message listing the denied tools. To allow a tool you've been denying, edit `~/.claude/settings.json`.

## Spec & design
- `../docs/superpowers/specs/2026-05-06-trading-cockpit-design.md`
- `../docs/superpowers/plans/2026-05-06-trading-cockpit.md`
