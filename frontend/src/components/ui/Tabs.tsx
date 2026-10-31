import React, { useRef } from "react";

export interface TabItem { id: string; label: string }

interface TabsProps { tabs: TabItem[]; value: string; onChange: (value: string) => void }

export const Tabs: React.FC<TabsProps> = ({ tabs, value, onChange }) => {
  const list = useRef<HTMLDivElement>(null);
  const focusAt = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = tabs.findIndex((tab) => tab.id === value);
    if (event.key === "ArrowRight") { event.preventDefault(); focusAt(current + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); focusAt(current - 1); }
    if (event.key === "Home") { event.preventDefault(); focusAt(0); }
    if (event.key === "End") { event.preventDefault(); focusAt(tabs.length - 1); }
  };

  return <div ref={list} role="tablist" aria-label="Plan sections" className="tab-list" onKeyDown={(event) => {
    if (event.target instanceof HTMLButtonElement) handleKeyDown(event as unknown as React.KeyboardEvent<HTMLButtonElement>);
  }}>
    {tabs.map((tab) => <button key={tab.id} id={`tab-${tab.id}`} role="tab" type="button" aria-selected={value === tab.id} aria-controls={`panel-${tab.id}`} tabIndex={value === tab.id ? 0 : -1} onClick={() => onChange(tab.id)} className={`rounded-xl px-4 text-sm font-semibold transition-[transform,opacity] duration-200 focus-visible:outline-focus ${value === tab.id ? "bg-accent text-white shadow-sm" : "text-muted hover:bg-white/60 hover:text-ink"}`}>
      {tab.label}
    </button>)}
  </div>;
};
