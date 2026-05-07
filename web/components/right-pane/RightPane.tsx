"use client";
import { useState } from "react";
import { VisualizationTab } from "./VisualizationTab";
import { FilesTab } from "./FilesTab";

type Tab = "vis" | "files";

export function RightPane() {
  const [tab, setTab] = useState<Tab>("files");
  return (
    <>
      <div className="flex border-b border-surface bg-chrome text-xs shrink-0">
        <TabButton active={tab === "vis"} onClick={() => setTab("vis")}>
          📊 Visualization
        </TabButton>
        <TabButton active={tab === "files"} onClick={() => setTab("files")}>
          📁 Files
        </TabButton>
      </div>
      {tab === "vis" ? <VisualizationTab /> : <FilesTab />}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-4 py-2",
        active ? "text-text border-b-2 border-primary bg-bg" : "text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
