"use client";
import { ReactNode, useState } from "react";

type Props = {
  drawer: ReactNode;
  topBar: ReactNode;
  chat: ReactNode;
  rightPane: ReactNode;
};

export function Shell({ drawer, topBar, chat, rightPane }: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-bg text-text">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-surface bg-chrome shrink-0">
        <button
          aria-label="toggle chat history"
          onClick={() => setDrawerOpen((v) => !v)}
          className="text-muted hover:text-text px-1 leading-none"
        >
          ☰
        </button>
        {topBar}
      </div>
      <div className="flex-1 grid grid-cols-[auto_1fr_1fr] min-h-0">
        <aside
          className={[
            "bg-chrome border-r border-surface overflow-hidden transition-[width] duration-200",
            drawerOpen ? "w-60" : "w-0",
          ].join(" ")}
        >
          <div className="w-60 h-full overflow-y-auto p-2">{drawer}</div>
        </aside>
        <section className="bg-bg flex flex-col min-h-0">{chat}</section>
        <section className="bg-bg border-l border-surface flex flex-col min-h-0">{rightPane}</section>
      </div>
    </div>
  );
}
