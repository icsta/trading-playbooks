import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseLine } from "@/lib/claude/parser";
import type { ClaudeEvent } from "@/lib/claude/types";

const FIXTURES = path.resolve(__dirname, "../../__fixtures__/claude-stream");

function parseFixture(name: string): ClaudeEvent[] {
  const raw = fs.readFileSync(path.join(FIXTURES, `${name}.jsonl`), "utf8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap(parseLine);
}

describe("parseLine", () => {
  it("returns [] for empty lines", () => {
    expect(parseLine("")).toEqual([]);
    expect(parseLine("   ")).toEqual([]);
  });

  it("returns [parse_error] for non-JSON", () => {
    const events = parseLine("not json");
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("parse_error");
  });

  it("emits system_init detected by subtype, not by line position", () => {
    const events = parseFixture("simple-text");
    // Hooks come first, then init. So init is not events[0].
    const initIdx = events.findIndex((e) => e.kind === "system_init");
    expect(initIdx).toBeGreaterThan(0);
    const init = events[initIdx];
    if (init.kind === "system_init") {
      expect(init.session_id).toMatch(/.+/);
    }
  });

  it("filters hook_started and hook_response as unknown (not as init)", () => {
    const events = parseFixture("simple-text");
    const initEvents = events.filter((e) => e.kind === "system_init");
    expect(initEvents).toHaveLength(1);
  });

  it("simple-text fixture ends with a result event carrying session_id and permission_denials []", () => {
    const events = parseFixture("simple-text");
    const last = events[events.length - 1];
    expect(last.kind).toBe("result");
    if (last.kind === "result") {
      expect(last.session_id).toMatch(/.+/);
      expect(last.permission_denials).toEqual([]);
    }
  });

  it("with-tool-call fixture emits tool_use_start and tool_result", () => {
    const events = parseFixture("with-tool-call");
    expect(events.some((e) => e.kind === "tool_use_start")).toBe(true);
    expect(events.some((e) => e.kind === "tool_result")).toBe(true);
  });

  it("with-permission fixture emits a tool_use_start (Bash auto-allowed)", () => {
    const events = parseFixture("with-permission");
    expect(events.some((e) => e.kind === "tool_use_start" && (e as any).name === "Bash")).toBe(true);
  });

  it("collapses stream_event content_block_delta (text_delta) to unknown so the UI doesn't double-render with the whole-message assistant turn", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("unknown");
  });

  it("collapses stream_event content_block_delta (input_json_delta) to unknown — hang-timer reset path during long tool_use generation", () => {
    const line = JSON.stringify({
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "input_json_delta", partial_json: '{"path":"outputs/F/' },
      },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("unknown");
  });

  it("parses synthetic assistant text content as text_delta", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "text", text: "ok" }] },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.kind).toBe("text_delta");
    if (e.kind === "text_delta") expect(e.text).toBe("ok");
  });

  it("parses synthetic assistant thinking content as unknown", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: { content: [{ type: "thinking", thinking: "...", signature: "x" }] },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe("unknown");
  });

  it("emits one event per assistant content block (text + tool_use)", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "calling now" },
          { type: "tool_use", id: "tool-1", name: "Read", input: { file_path: "a.md" } },
        ],
      },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(2);
    expect(events[0].kind).toBe("text_delta");
    expect(events[1].kind).toBe("tool_use_start");
  });

  it("parses synthetic result with permission_denials", () => {
    const line = JSON.stringify({
      type: "result",
      session_id: "abc",
      duration_ms: 100,
      total_cost_usd: 0.01,
      permission_denials: [{ tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "rm -rf /" } }],
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.kind).toBe("result");
    if (e.kind === "result") {
      expect(e.session_id).toBe("abc");
      expect(e.permission_denials).toHaveLength(1);
      expect(e.permission_denials[0].tool_name).toBe("Bash");
    }
  });

  it("parses synthetic user tool_result with is_error", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "permission denied", is_error: true },
        ],
      },
    });
    const events = parseLine(line);
    expect(events).toHaveLength(1);
    const e = events[0];
    expect(e.kind).toBe("tool_result");
    if (e.kind === "tool_result") {
      expect(e.is_error).toBe(true);
      expect(e.tool_use_id).toBe("t1");
    }
  });
});
