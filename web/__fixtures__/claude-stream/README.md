# Claude Stream-JSON Fixtures

Each `.jsonl` file is a stdout capture from running `claude -p --input-format stream-json --output-format stream-json --verbose` against the trading-playbooks project root, with the user prompt described in this file's note.

Captured against `claude` v2.1.119 on 2026-05-05.

## Invocation note

`--input-format stream-json` requires `--print` (`-p`) and `--verbose`. Without `-p`, claude rejects the flag combination. The wrapper in `web/scripts/spike-claude-stream.sh` is intended for interactive piping during development; the fixtures here were captured in single-shot non-interactive form (one stdin line, then EOF).

## simple-text.jsonl
Input: `{"type":"user","message":{"role":"user","content":"What is 2+2?"}}`

Captured events (in order):
1. `system` / `hook_started` — `SessionStart:startup` hook fired
2. `system` / `hook_response` — hook output (long superpowers context blob)
3. `system` / `init` — session init: `session_id`, `cwd`, `tools[]`, `mcp_servers[]`, `model`, `permissionMode`, `slash_commands[]`, `skills[]`, `plugins[]`, `memory_paths{}`
4. `assistant` — message with `content: [{type:"text", text:"4"}]`
5. `rate_limit_event` — informational, status/resetsAt/etc.
6. `result` / `success` — `result:"4"`, `stop_reason:"end_turn"`, `permission_denials:[]`, `terminal_reason:"completed"`, plus full token usage and cost

## with-tool-call.jsonl
Input: `{"type":"user","message":{"role":"user","content":"Use the Read tool to open /Users/justin/Code/trading-playbooks/README.md and report only its first heading line."}}`

(Note: the original prompt "Read CLAUDE.md and summarize" did not actually call the Read tool because CLAUDE.md is auto-discovered and inlined into claude's system prompt for the project root. We changed the prompt to force a Read tool call against `README.md`, so the fixture demonstrates a real `tool_use` → `tool_result` round-trip.)

Captured events (in order):
1. `system` / `hook_started`, `hook_response`, `init` (same as above)
2. `assistant` — `content: [{type:"thinking", thinking:"...", signature:"..."}]`
3. `assistant` — `content: [{type:"tool_use", id:"toolu_...", name:"Read", input:{file_path, limit}, caller:...}]`
4. `user` — `content: [{type:"tool_result", tool_use_id:"toolu_...", content:"<file body>"}]` plus a sibling top-level `tool_use_result` field summarizing the result (e.g. `{file:{...}, type:"text"}`)
5. `rate_limit_event`
6. `assistant` — `content: [{type:"text", text:"`# trading-playbooks`"}]`
7. `result` / `success`

## with-permission.jsonl
Input: `{"type":"user","message":{"role":"user","content":"Run `echo hello` via bash."}}`

This was captured in non-interactive `-p` mode. **Important finding:** in that mode claude does not emit a separate `permission_request` event on stdout. The Bash invocation was auto-allowed and surfaced as a normal `tool_use` → `tool_result` flow. The `result` event includes `permission_denials: []`.

Captured events (in order):
1. `system` / `hook_started`, `hook_response`, `init`
2. `assistant` — `content: [{type:"thinking", ...}]`
3. `assistant` — `content: [{type:"tool_use", name:"Bash", input:{command:"echo hello", description:"..."}}]`
4. `rate_limit_event`
5. `user` — `content: [{type:"tool_result", tool_use_id, content:"hello", is_error:false}]`, sibling `tool_use_result: {stdout:"hello", stderr:"", interrupted:false, isImage:false, noOutputExpected:false}`
6. `assistant` — `content: [{type:"text", text:"hello"}]`
7. `result` / `success` with `permission_denials: []`

### How permission denials actually surface

When a tool invocation is denied (we elicited this with `--permission-mode plan` against `ExitPlanMode`), no dedicated `permission_request` event appears. Instead:

- The `user` event echoing the tool result has `content[0].is_error: true` and a short text like `"Exit plan mode?"` or similar denial message; the sibling `tool_use_result` field is a string starting with `"Error: ..."`.
- The terminal `result` event contains `permission_denials: [{tool_name, tool_use_id, tool_input}]` listing every denied call.

Implication for the bridge: the parser does NOT need a `permission_request` case. Permission gating in the live UI must be modelled as either (a) interactive prompting via stdin (not exercised by `-p` runs) or (b) post-hoc detection via `is_error: true` tool_results plus the final `result.permission_denials` array.
