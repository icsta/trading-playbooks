import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import readline from "node:readline";
import { parseLine } from "./parser";
import type { ClaudeEvent } from "./types";

export type BridgeOpts = {
  /** Command to spawn. Default: "claude" */
  command?: string;
  /** Override the args passed to the subprocess. If omitted, bridge synthesizes claude args. */
  args?: string[];
  /** Extra env vars merged onto process.env */
  env?: NodeJS.ProcessEnv;
  /** Working directory for the subprocess */
  cwd: string;
  /** Pass --resume <resumeId> to claude */
  resumeId?: string;
  /**
   * Absolute path to an MCP config JSON file. Forwarded to claude as
   * --mcp-config <path> so the spawned subprocess connects to our
   * cockpit-side MCP server (filesystem tools scoped to outputs/).
   */
  mcpConfigPath?: string;
  /** Kill the subprocess if no stdout for this long during a generation */
  hangTimeoutMs: number;
};

export type BridgeEventMap = {
  event: [ClaudeEvent];
  exit: [{ code: number | null; signal: NodeJS.Signals | null }];
  hang_timeout: [];
  error: [Error];
};

export class ClaudeBridge extends EventEmitter<BridgeEventMap> {
  private proc: ChildProcess | null = null;
  private _sessionId: string | null = null;
  private hangTimer: NodeJS.Timeout | null = null;
  private generating = false;

  constructor(private opts: BridgeOpts) {
    super();
    if (opts.resumeId) this._sessionId = opts.resumeId;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  isAlive(): boolean {
    return this.proc !== null && this.proc.exitCode === null;
  }

  /** Spawn a fresh subprocess and send the user message. One-shot per call. */
  send(content: string): void {
    if (this.generating || this.proc) {
      throw new Error("ClaudeBridge.send called while a generation is in flight");
    }

    const command = this.opts.command ?? "claude";
    const args =
      this.opts.args ??
      [
        "-p",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        ...(this.opts.mcpConfigPath ? ["--mcp-config", this.opts.mcpConfigPath] : []),
        ...(this.opts.resumeId ? ["--resume", this.opts.resumeId] : []),
      ];

    const env = { ...process.env, ...this.opts.env };
    delete env.CLAUDECODE;

    this.proc = spawn(command, args, {
      cwd: this.opts.cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.generating = true;

    this.proc.on("error", (err) => this.emit("error", err));
    this.proc.on("exit", (code, signal) => {
      this.clearHangTimer();
      this.proc = null;
      this.generating = false;
      this.emit("exit", { code, signal });
    });

    if (this.proc.stderr) {
      this.proc.stderr.on("data", (chunk: Buffer) => {
        const s = chunk.toString().trim();
        if (s) this.emit("error", new Error(`claude stderr: ${s.slice(0, 500)}`));
      });
    }

    if (this.proc.stdout) {
      const rl = readline.createInterface({ input: this.proc.stdout });
      rl.on("line", (line) => this.handleLine(line));
    }

    if (this.proc.stdin) {
      const envelope = { type: "user", message: { role: "user", content } };
      this.proc.stdin.write(JSON.stringify(envelope) + "\n");
      this.proc.stdin.end();
    }

    this.startHangTimer();
  }

  /** Forcibly terminate the in-flight subprocess (if any). */
  cancel(): void {
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
    }
  }

  async stop(graceMs = 5000): Promise<void> {
    this.clearHangTimer();
    if (!this.proc) return;
    const proc = this.proc;
    return new Promise((resolve) => {
      proc.once("exit", () => resolve());
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
      setTimeout(() => {
        if (proc.exitCode === null) {
          try { proc.kill("SIGKILL"); } catch { /* ignore */ }
        }
      }, graceMs);
    });
  }

  private handleLine(line: string): void {
    const events = parseLine(line);
    if (events.length === 0) return;
    this.startHangTimer(); // reset on activity
    for (const ev of events) {
      if (ev.kind === "system_init" && ev.session_id) {
        this._sessionId = ev.session_id;
      }
      this.emit("event", ev);
    }
  }

  private startHangTimer(): void {
    this.clearHangTimer();
    this.hangTimer = setTimeout(() => {
      if (this.generating) {
        this.emit("hang_timeout");
        // Kill it
        if (this.proc) {
          try { this.proc.kill("SIGTERM"); } catch { /* ignore */ }
          setTimeout(() => {
            if (this.proc && this.proc.exitCode === null) {
              try { this.proc.kill("SIGKILL"); } catch { /* ignore */ }
            }
          }, 2_000);
        }
      }
    }, this.opts.hangTimeoutMs);
  }

  private clearHangTimer(): void {
    if (this.hangTimer) {
      clearTimeout(this.hangTimer);
      this.hangTimer = null;
    }
  }
}
