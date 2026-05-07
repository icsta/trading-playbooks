"use client";

export function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-2 py-2" aria-label="Claude is thinking">
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
        style={{ animationDelay: "0ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
        style={{ animationDelay: "200ms" }}
      />
      <span
        className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse"
        style={{ animationDelay: "400ms" }}
      />
    </div>
  );
}
