"use client";
import { useState, useCallback } from "react";

export type FsEntry = { name: string; kind: "file" | "dir"; size?: number };
export type ViewMode =
  | { kind: "list"; path: string }
  | { kind: "file"; path: string };

export function useFileBrowser() {
  const [stack, setStack] = useState<ViewMode[]>([{ kind: "list", path: "" }]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [content, setContent] = useState<{ text: string; truncated: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = stack[stack.length - 1];

  const list = useCallback(async (p: string) => {
    setError(null);
    setContent(null);
    try {
      const r = await fetch(`/api/files?path=${encodeURIComponent(p)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `list_failed_${r.status}`);
      }
      const j = (await r.json()) as { entries: FsEntry[] };
      setEntries(j.entries);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const read = useCallback(async (p: string) => {
    setError(null);
    try {
      const r = await fetch(`/api/files/content?path=${encodeURIComponent(p)}`);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `read_failed_${r.status}`);
      }
      const j = (await r.json()) as { content: string; truncated: boolean };
      setContent({ text: j.content, truncated: j.truncated });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const open = useCallback(
    async (entry: FsEntry, parentPath: string) => {
      const next = parentPath ? `${parentPath}/${entry.name}` : entry.name;
      if (entry.kind === "dir") {
        setStack((s) => [...s, { kind: "list", path: next }]);
        await list(next);
      } else {
        setStack((s) => [...s, { kind: "file", path: next }]);
        await read(next);
      }
    },
    [list, read],
  );

  const back = useCallback(async () => {
    if (stack.length <= 1) return;
    const newStack = stack.slice(0, -1);
    setStack(newStack);
    const top = newStack[newStack.length - 1];
    if (top.kind === "list") await list(top.path);
    else await read(top.path);
  }, [stack, list, read]);

  return {
    current,
    entries,
    content,
    error,
    list,
    read,
    open,
    back,
    canBack: stack.length > 1,
  };
}
