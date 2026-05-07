"use client";
import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

type Props = { onSend: (text: string) => void; disabled?: boolean };

export function Composer({ onSend, disabled }: Props) {
  const [val, setVal] = useState("");
  const submit = () => {
    const text = val.trim();
    if (!text || disabled) return;
    onSend(text);
    setVal("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <div className="border-t border-surface bg-chrome p-3 flex gap-2">
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        placeholder="Ask Claude…  (Cmd/Ctrl+Enter to send)"
        className="flex-1 bg-bg text-text border border-surface rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
        disabled={disabled}
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled || !val.trim()}
        className="self-end bg-primary text-[#0a0e16] px-3 py-2 rounded-md text-sm flex items-center gap-1 disabled:opacity-40"
      >
        <Send size={14} /> Send
      </button>
    </div>
  );
}
