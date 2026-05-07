import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

export type ReplayEvent =
  | { kind: "user_msg"; content: string }
  | { kind: "text_delta"; text: string }
  | { kind: "tool_use_start"; id: string; name: string; input: unknown }
  | { kind: "tool_result"; tool_use_id: string; content: unknown; is_error: boolean };

/**
 * Path encoding: Claude Code stores transcripts under
 *   ~/.claude/projects/<absolute-path-with-slashes-replaced-by-dashes>/<session-id>.jsonl
 *
 * For example, /Users/justin/Code/trading-playbooks becomes
 *               -Users-justin-Code-trading-playbooks.
 */
export function transcriptPath(projectRoot: string, sessionId: string): string {
  const encoded = path.resolve(projectRoot).replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
}

/**
 * Stream a session's prior turns as ReplayEvents.
 *
 * Filters: meta messages, sidechain (subagent) messages, thinking blocks,
 * snapshot/attachment/system noise. Only emits the events the chat UI needs
 * to reconstruct what the user saw.
 */
export async function* streamTranscript(
  projectRoot: string,
  sessionId: string,
): AsyncGenerator<ReplayEvent> {
  const file = transcriptPath(projectRoot, sessionId);
  if (!fs.existsSync(file)) return;

  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const events = lineToReplayEvents(obj as Record<string, unknown>);
      for (const ev of events) yield ev;
    }
  } finally {
    rl.close();
    stream.close();
  }
}

function lineToReplayEvents(o: Record<string, unknown>): ReplayEvent[] {
  // Skip everything that isn't a real user/assistant turn
  if (o.isMeta || o.isSidechain) return [];
  const t = o.type as string | undefined;

  if (t === "user") {
    const message = o.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === "string") {
      // Skip empty
      if (!content.trim()) return [];
      return [{ kind: "user_msg", content }];
    }
    if (Array.isArray(content)) {
      // tool_result wrappers (claude echoing tool results back)
      const results: ReplayEvent[] = [];
      for (const block of content as Array<Record<string, unknown>>) {
        if (block?.type === "tool_result") {
          results.push({
            kind: "tool_result",
            tool_use_id: (block.tool_use_id as string) ?? "",
            content: block.content ?? "",
            is_error: !!block.is_error,
          });
        }
      }
      return results;
    }
    return [];
  }

  if (t === "assistant") {
    const message = o.message as Record<string, unknown> | undefined;
    const blocks = (message?.content as Array<Record<string, unknown>> | undefined) ?? [];
    const events: ReplayEvent[] = [];
    for (const block of blocks) {
      if (block?.type === "text") {
        const text = (block.text as string) ?? "";
        if (text) events.push({ kind: "text_delta", text });
      } else if (block?.type === "tool_use") {
        events.push({
          kind: "tool_use_start",
          id: (block.id as string) ?? "",
          name: (block.name as string) ?? "",
          input: block.input ?? {},
        });
      }
      // thinking blocks and anything else: skipped
    }
    return events;
  }

  // Skip system, file-history-snapshot, attachment, last-prompt, permission-mode,
  // queue-operation — none of those belong in the user-facing transcript.
  return [];
}
