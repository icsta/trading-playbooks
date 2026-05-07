"use client";
import { Folder, FileText } from "lucide-react";
import type { FsEntry } from "@/hooks/useFileBrowser";

type Props = { entries: FsEntry[]; onOpen: (e: FsEntry) => void };

export function FileTree({ entries, onOpen }: Props) {
  const visible = entries.filter((e) => !e.name.startsWith("."));
  if (visible.length === 0) {
    return <div className="text-muted text-xs p-3">empty</div>;
  }
  return (
    <div className="flex flex-col">
      {visible.map((e) => (
        <button
          key={e.name}
          type="button"
          onClick={() => onOpen(e)}
          className="flex items-center gap-2 px-3 py-1.5 text-left text-sm text-text hover:bg-surface/50"
        >
          {e.kind === "dir" ? (
            <Folder size={14} className="text-primary" />
          ) : (
            <FileText size={14} className="text-muted" />
          )}
          <span className="truncate flex-1">{e.name}</span>
          {e.size !== undefined ? (
            <span className="text-muted text-xs">{formatSize(e.size)}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  return `${(n / 1024 / 1024).toFixed(1)}M`;
}
