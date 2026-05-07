"use client";
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ToolCall } from "@/stores/chatStore";

export function ToolCallBlock({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  const summary = oneLineSummary(tool);
  const errored = !!tool.error;

  return (
    <div
      className={[
        "my-2 rounded-md border bg-chrome",
        errored ? "border-danger/40" : "border-surface",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs text-muted hover:text-text"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="text-primary font-mono">{tool.name}</span>
        <span className="font-mono truncate flex-1">{summary}</span>
        {errored ? (
          <span className="text-danger font-medium">error</span>
        ) : tool.result !== undefined ? (
          <span className="text-success">ok</span>
        ) : (
          <span className="text-muted">…</span>
        )}
      </button>
      {open ? (
        <div className="px-3 pb-3 text-xs font-mono text-text whitespace-pre-wrap break-words">
          <div className="text-muted">args:</div>
          <pre className="text-text">{safeStringify(tool.args)}</pre>
          {tool.result !== undefined ? (
            <>
              <div className="text-muted mt-2">{errored ? "error:" : "result:"}</div>
              <pre className={errored ? "text-danger" : "text-text"}>
                {safeStringify(tool.result)}
              </pre>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function oneLineSummary(t: ToolCall): string {
  const a = t.args as Record<string, unknown> | undefined;
  if (t.name === "Read" && typeof a?.file_path === "string") return a.file_path;
  if (t.name === "Bash" && typeof a?.command === "string") return a.command;
  if (t.name === "Edit" && typeof a?.file_path === "string") return a.file_path;
  if (t.name === "Grep" && typeof a?.pattern === "string") return `/${a.pattern}/`;
  return safeStringify(a).slice(0, 80);
}

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
