import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { transcriptPath, streamTranscript } from "@/lib/sessions/transcript";

describe("transcript replay", () => {
  let projectRoot: string;
  let claudeHome: string;
  let originalHome: string | undefined;

  beforeEach(() => {
    // Sandbox: pretend HOME points at a tempdir so transcriptPath resolves locally
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-tr-proj-"));
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cockpit-tr-home-"));
    originalHome = process.env.HOME;
    process.env.HOME = claudeHome;
  });
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome;
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  function writeTranscript(sessionId: string, lines: object[]): void {
    const encoded = projectRoot.replace(/\//g, "-");
    const dir = path.join(claudeHome, ".claude", "projects", encoded);
    fs.mkdirSync(dir, { recursive: true });
    const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), body, "utf8");
  }

  it("transcriptPath encodes slashes as dashes", () => {
    const p = transcriptPath("/foo/bar/baz", "sid-1");
    expect(p).toBe(path.join(claudeHome, ".claude", "projects", "-foo-bar-baz", "sid-1.jsonl"));
  });

  it("yields nothing when transcript file is missing", async () => {
    const events: unknown[] = [];
    for await (const e of streamTranscript(projectRoot, "no-such")) events.push(e);
    expect(events).toEqual([]);
  });

  it("emits user_msg, tool_use_start, tool_result, text_delta in order", async () => {
    writeTranscript("sid-1", [
      { type: "file-history-snapshot" }, // skipped
      { type: "user", isMeta: true, message: { role: "user", content: "<command-name>/init</command-name>" } }, // skipped
      { type: "user", message: { role: "user", content: "summarize SPY" } },
      { type: "assistant", message: { content: [{ type: "thinking", thinking: "..." }] } }, // skipped block
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "tu1", name: "Read", input: { file_path: "x.md" } }] },
      },
      {
        type: "user",
        message: { content: [{ type: "tool_result", tool_use_id: "tu1", content: "file body" }] },
      },
      {
        type: "assistant",
        message: { content: [{ type: "text", text: "Here is the summary." }] },
      },
      { type: "system", subtype: "init" }, // skipped
    ]);

    const events: unknown[] = [];
    for await (const e of streamTranscript(projectRoot, "sid-1")) events.push(e);

    expect(events).toEqual([
      { kind: "user_msg", content: "summarize SPY" },
      { kind: "tool_use_start", id: "tu1", name: "Read", input: { file_path: "x.md" } },
      { kind: "tool_result", tool_use_id: "tu1", content: "file body", is_error: false },
      { kind: "text_delta", text: "Here is the summary." },
    ]);
  });

  it("filters sidechain (subagent) messages", async () => {
    writeTranscript("sid-2", [
      { type: "user", message: { role: "user", content: "main" } },
      { type: "user", isSidechain: true, message: { role: "user", content: "sidechain user" } },
      { type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "sidechain reply" }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "main reply" }] } },
    ]);

    const events: unknown[] = [];
    for await (const e of streamTranscript(projectRoot, "sid-2")) events.push(e);
    expect(events).toEqual([
      { kind: "user_msg", content: "main" },
      { kind: "text_delta", text: "main reply" },
    ]);
  });

  it("preserves is_error on tool_result", async () => {
    writeTranscript("sid-3", [
      { type: "user", message: { role: "user", content: "do it" } },
      {
        type: "assistant",
        message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "rm /etc/passwd" } }] },
      },
      {
        type: "user",
        message: {
          content: [
            { type: "tool_result", tool_use_id: "t1", content: "permission denied", is_error: true },
          ],
        },
      },
    ]);

    const events: unknown[] = [];
    for await (const e of streamTranscript(projectRoot, "sid-3")) events.push(e);
    const tr = events.find((e) => (e as { kind: string }).kind === "tool_result") as { is_error: boolean };
    expect(tr.is_error).toBe(true);
  });
});
