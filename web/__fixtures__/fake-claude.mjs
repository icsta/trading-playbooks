#!/usr/bin/env node
// Minimal one-shot `claude` stand-in for ClaudeBridge tests.
// Behavior:
//   - Reads exactly one JSON-line user message from stdin (then EOF or first newline triggers run).
//   - Emits stream-json events on stdout, mimicking real claude's shape (hooks → init → ... → result).
//   - Exits with code 0 (or the configured FAKE_EXIT_CODE).
//
// Env vars:
//   MODE=simple        — emit text + result
//   MODE=tool          — emit tool_use, tool_result, text, result
//   MODE=denial        — emit tool_use that gets denied (tool_result.is_error=true), result with permission_denials
//   MODE=crash         — exit immediately with code 7 after init
//   MODE=hang          — emit init only, then never exit (caller must SIGTERM)
//   FAKE_SESSION_ID    — session id to put in init+result (default: "fake-session-001")

import readline from "node:readline";

const MODE = process.env.MODE ?? "simple";
const SESSION_ID = process.env.FAKE_SESSION_ID ?? "fake-session-001";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function run(userText) {
  // Init only after we receive the user message — matches real claude in -p mode
  emit({ type: "system", subtype: "init", session_id: SESSION_ID, model: "fake-sonnet", cwd: process.cwd() });

  if (MODE === "crash") {
    process.exit(7);
  }
  if (MODE === "hang") {
    // Keep the process alive indefinitely so the bridge's hang timer can fire.
    // Caller is expected to SIGTERM us.
    setInterval(() => {}, 1_000_000);
    return;
  }

  if (MODE === "tool") {
    emit({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "tool_1", name: "Read", input: { file_path: "x.md" } }] },
    });
    emit({
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "tool_1", content: "fake content" }] },
    });
  }

  if (MODE === "denial") {
    emit({
      type: "assistant",
      message: { content: [{ type: "tool_use", id: "tool_1", name: "Bash", input: { command: "rm -rf /" } }] },
    });
    emit({
      type: "user",
      message: {
        content: [{ type: "tool_result", tool_use_id: "tool_1", content: "Permission denied", is_error: true }],
      },
    });
    emit({ type: "assistant", message: { content: [{ type: "text", text: `understood: ${userText}` }] } });
    emit({
      type: "result",
      session_id: SESSION_ID,
      duration_ms: 10,
      total_cost_usd: 0.001,
      permission_denials: [{ tool_name: "Bash", tool_use_id: "tool_1", tool_input: { command: "rm -rf /" } }],
    });
    process.exit(0);
  }

  // Default + tool path: emit text + result
  emit({ type: "assistant", message: { content: [{ type: "text", text: `pong: ${userText}` }] } });
  emit({ type: "result", session_id: SESSION_ID, duration_ms: 10, total_cost_usd: 0.001, permission_denials: [] });
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin });
let received = false;
rl.on("line", (line) => {
  if (received) return;
  received = true;
  try {
    const parsed = JSON.parse(line);
    const text = parsed?.message?.content ?? "";
    run(typeof text === "string" ? text : "");
  } catch {
    run("");
  }
});
rl.on("close", () => {
  if (!received) process.exit(0); // stdin closed without a message
});
