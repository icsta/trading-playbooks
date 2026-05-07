import { describe, it, expect, vi } from "vitest";
import path from "node:path";
import { ClaudeBridge } from "@/lib/claude/bridge";
import type { ClaudeEvent } from "@/lib/claude/types";

const FAKE = path.resolve(__dirname, "../../__fixtures__/fake-claude.mjs");

function bridgeWith(mode: string, opts: Partial<{ resumeId: string; hangMs: number }> = {}) {
  return new ClaudeBridge({
    command: process.execPath, // node
    args: [FAKE],
    env: { MODE: mode, FAKE_SESSION_ID: "test-001" },
    cwd: process.cwd(),
    resumeId: opts.resumeId,
    hangTimeoutMs: opts.hangMs ?? 5_000,
  });
}

async function collectUntilExit(bridge: ClaudeBridge): Promise<{ events: ClaudeEvent[]; exit: { code: number | null; signal: NodeJS.Signals | null } }> {
  return new Promise((resolve, reject) => {
    const events: ClaudeEvent[] = [];
    const t = setTimeout(() => reject(new Error("timeout waiting for exit")), 8_000);
    bridge.on("event", (e) => events.push(e));
    bridge.on("exit", (info) => {
      clearTimeout(t);
      resolve({ events, exit: info });
    });
  });
}

describe("ClaudeBridge", () => {
  it("spawns a fresh subprocess on send(), emits events, and exits", async () => {
    const bridge = bridgeWith("simple");
    bridge.send("hello");
    const { events, exit } = await collectUntilExit(bridge);
    expect(events.some((e) => e.kind === "system_init")).toBe(true);
    expect(events.some((e) => e.kind === "text_delta")).toBe(true);
    expect(events.some((e) => e.kind === "result")).toBe(true);
    expect(exit.code).toBe(0);
  });

  it("captures session_id from system_init", async () => {
    const bridge = bridgeWith("simple");
    bridge.send("hello");
    await collectUntilExit(bridge);
    expect(bridge.sessionId).toBe("test-001");
  });

  it("synthesizes default claude args including --include-partial-messages when opts.args is omitted", async () => {
    // Same arg-dumper trick as the explicit-args test below, but here we want
    // to capture what the bridge SYNTHESIZES (opts.args undefined). We point
    // `command` at the dumper directly so the synthesized claude flags become
    // the dumper's argv.
    const argDumper = path.resolve(__dirname, "../../__fixtures__/arg-dumper.mjs");
    const fs = await import("node:fs");
    const dumperBody = `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(0);\n`;
    fs.writeFileSync(argDumper, dumperBody, { mode: 0o755 });
    const bridge = new ClaudeBridge({
      command: argDumper,
      cwd: process.cwd(),
      mcpConfigPath: "/tmp/cockpit-mcp-test.json",
      hangTimeoutMs: 5_000,
    });
    bridge.send("hi");
    const { events } = await collectUntilExit(bridge);
    const dumped = events
      .filter((e) => e.kind === "unknown")
      .map((e) => (e.kind === "unknown" ? e.raw : null))
      .find((raw) => Array.isArray(raw)) as string[] | undefined;
    if (!dumped) {
      throw new Error("expected an unknown event whose raw is the dumper's argv array");
    }
    expect(dumped).toContain("--include-partial-messages");
    expect(dumped).toContain("-p");
    expect(dumped).toContain("--input-format");
    expect(dumped).toContain("--output-format");
    expect(dumped).toContain("stream-json");
    expect(dumped).toContain("--mcp-config");
    expect(dumped).toContain("/tmp/cockpit-mcp-test.json");
  });

  it("respects explicit args[] and does not append --resume when one is provided", async () => {
    // The dumper prints its argv as a JSON array on stdout, then exits. The array
    // shape is not a known claude envelope, so the parser yields an `unknown` event
    // whose `raw` is the parsed JSON array — perfect for asserting bridge arg synthesis.
    const argDumper = path.resolve(__dirname, "../../__fixtures__/arg-dumper.mjs");
    const fs = await import("node:fs");
    const dumperBody = `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)) + "\\n");\nprocess.exit(0);\n`;
    fs.writeFileSync(argDumper, dumperBody, { mode: 0o755 });
    const bridge = new ClaudeBridge({
      command: process.execPath,
      args: [argDumper, "explicit-arg-1", "explicit-arg-2"],
      cwd: process.cwd(),
      resumeId: "abc-xyz",
      hangTimeoutMs: 5_000,
    });
    bridge.send("hi");
    const { events } = await collectUntilExit(bridge);
    const dumped = events
      .filter((e) => e.kind === "unknown")
      .map((e) => (e.kind === "unknown" ? e.raw : null))
      .find((raw) => Array.isArray(raw)) as string[] | undefined;
    if (!dumped) {
      throw new Error("expected an unknown event whose raw is the dumper's argv array");
    }
    // Bridge should pass exactly the explicit args, not append --resume.
    expect(dumped).not.toContain("--resume");
    expect(dumped).toEqual(["explicit-arg-1", "explicit-arg-2"]);
  });

  it("emits exit with non-zero code on subprocess crash", async () => {
    const bridge = bridgeWith("crash");
    bridge.send("die");
    const { exit } = await collectUntilExit(bridge);
    expect(exit.code).toBe(7);
  });

  it("triggers hang timeout when subprocess emits no further output for too long", async () => {
    const bridge = bridgeWith("hang", { hangMs: 200 });
    const onHang = vi.fn();
    bridge.on("hang_timeout", onHang);
    bridge.send("nope");
    await collectUntilExit(bridge);
    expect(onHang).toHaveBeenCalled();
  }, 10_000);

  it("emits tool_use_start, tool_result, text_delta, result for tool mode", async () => {
    const bridge = bridgeWith("tool");
    bridge.send("read x");
    const { events } = await collectUntilExit(bridge);
    expect(events.some((e) => e.kind === "tool_use_start")).toBe(true);
    expect(events.some((e) => e.kind === "tool_result")).toBe(true);
    expect(events.some((e) => e.kind === "text_delta")).toBe(true);
    expect(events.some((e) => e.kind === "result")).toBe(true);
  });

  it("surfaces tool_result.is_error and result.permission_denials in denial mode", async () => {
    const bridge = bridgeWith("denial");
    bridge.send("rm");
    const { events } = await collectUntilExit(bridge);
    const denialResult = events.find((e) => e.kind === "tool_result");
    expect(denialResult?.kind === "tool_result" && denialResult.is_error).toBe(true);
    const result = events.find((e) => e.kind === "result");
    if (result?.kind !== "result") throw new Error("expected result event");
    expect(result.permission_denials).toHaveLength(1);
    expect(result.permission_denials[0].tool_name).toBe("Bash");
  });

  it("rejects send() if a generation is already in flight", async () => {
    const bridge = bridgeWith("hang", { hangMs: 1_000 });
    bridge.send("first");
    expect(() => bridge.send("second")).toThrow();
    await collectUntilExit(bridge); // drain hang timeout
  });
});
