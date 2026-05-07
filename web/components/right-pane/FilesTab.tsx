"use client";
import { useEffect } from "react";
import { ChevronLeft } from "lucide-react";
import { useFileBrowser } from "@/hooks/useFileBrowser";
import { FileTree } from "./FileTree";
import { MarkdownViewer } from "@/components/MarkdownViewer";

export function FilesTab() {
  const { current, entries, content, error, list, open, back, canBack } = useFileBrowser();

  useEffect(() => {
    void list("");
  }, [list]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-surface bg-chrome text-xs">
        <button
          type="button"
          onClick={() => void back()}
          disabled={!canBack}
          className="text-primary disabled:text-muted disabled:cursor-not-allowed flex items-center gap-1"
        >
          <ChevronLeft size={14} /> back
        </button>
        <span className="text-muted">·</span>
        <span className="text-text font-mono truncate">/{current.path || ""}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {error ? (
          <div className="text-danger p-3 text-sm">{error}</div>
        ) : current.kind === "list" ? (
          <FileTree entries={entries} onOpen={(e) => void open(e, current.path)} />
        ) : content ? (
          <div className="p-4">
            {content.truncated ? (
              <div className="mb-3 text-xs text-warning">⚠ file truncated to first 1MB</div>
            ) : null}
            <MarkdownViewer source={content.text} />
          </div>
        ) : (
          <div className="text-muted p-3 text-xs">loading…</div>
        )}
      </div>
    </div>
  );
}
