"use client";

import { Children, type ReactNode, useState } from "react";

const INITIAL_VISIBLE_COUNT = 4;

export function CollapsibleActivityGrid({ children, sectionKey }: { children: ReactNode; sectionKey: "active" | "past" }) {
  const [expanded, setExpanded] = useState(false);
  const cards = Children.toArray(children);
  const hasMore = cards.length > INITIAL_VISIBLE_COUNT;
  const visibleCards = expanded ? cards : cards.slice(0, INITIAL_VISIBLE_COUNT);

  return <>
    <div className="grid gap-3 lg:grid-cols-2">{visibleCards}</div>
    {hasMore && <div className="mt-4 flex justify-center">
      <button
        type="button"
        data-testid={`activity-toggle-${sectionKey}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
        className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-bold text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
      >
        {expanded ? "折りたたむ ↑" : `すべて表示（あと${cards.length - INITIAL_VISIBLE_COUNT}件） ↓`}
      </button>
    </div>}
  </>;
}
