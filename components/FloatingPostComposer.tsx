"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import type { MyTopicFaction } from "@/lib/topic-memberships";
import { PostComposer } from "@/components/PostComposer";

type FloatingPostComposerProps = {
  slug: string;
  factions: MyTopicFaction[];
  primaryFactionId: string;
  allowFactionSelection: boolean;
  currentFactionName: string;
  identityLabel: string;
  identityValue: string;
  remainingPosts?: number | null;
  canPost: boolean;
  postDisabledReason?: string;
  children?: ReactNode;
};

export function FloatingPostComposer({ slug, factions, primaryFactionId, allowFactionSelection, currentFactionName, identityLabel, identityValue, remainingPosts, canPost, postDisabledReason, children }: FloatingPostComposerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function closeOnEscape(event: KeyboardEvent) { if (event.key === "Escape") setIsOpen(false); }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isOpen]);

  return <div data-testid="participant-composer" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
    <div className="mx-auto grid w-full max-w-[1480px] gap-8 px-3 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,300px)] lg:px-8">
      <div className="pointer-events-auto min-w-0 pt-2" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-[0_-6px_24px_rgba(15,23,42,0.12)]">
          <div id={panelId} aria-hidden={!isOpen} className={`overflow-y-auto transition-[max-height,opacity,transform] duration-200 motion-reduce:transition-none ${isOpen ? "max-h-[75vh] translate-y-0 opacity-100 sm:max-h-[560px]" : "pointer-events-none invisible max-h-0 translate-y-2 opacity-0"}`}>
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black tracking-wider text-emerald-700">参加情報</p><p className="mt-1 text-sm font-black text-slate-900">● 参加中</p></div><button type="button" onClick={() => setIsOpen(false)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50" aria-label="参加・発言パネルを閉じる">閉じる</button></div>
              <dl className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-bold text-slate-500">{identityLabel}</dt><dd className="mt-1 font-black text-slate-900">{identityValue}</dd></div><div><dt className="text-xs font-bold text-slate-500">現在の派閥：</dt><dd data-testid="participant-current-faction" className="mt-1 font-black text-slate-900">{currentFactionName}</dd></div></dl>
              {children && <div data-testid="faction-management" className="mt-4">{children}</div>}
              <div className="my-5 border-t border-slate-200" />
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[11px] font-black tracking-wider text-blue-700">NEW MAIN STATEMENT</p><h2 className="mt-1 text-base font-black text-slate-900">新しい意見を発言</h2></div>{remainingPosts != null && <p className="text-xs font-bold text-slate-500">残り{remainingPosts}回</p>}</div>
              {canPost ? <PostComposer slug={slug} factions={factions} primaryFactionId={primaryFactionId} allowFactionSelection={allowFactionSelection} onSuccess={() => setIsOpen(false)} /> : <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900">{postDisabledReason ?? "現在、新しい発言はできません"}</div>}
            </div>
          </div>
          {!isOpen && <button type="button" data-testid="main-post-composer-open" onClick={() => setIsOpen(true)} aria-expanded={isOpen} aria-controls={panelId} className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-slate-50 sm:px-5"><span data-testid="participant-panel-open" className="shrink-0 text-xs font-black text-emerald-700">● 参加中</span><span className="hidden min-w-0 truncate text-xs font-bold text-slate-600 sm:block">{identityValue}</span><span data-testid="participant-current-faction" className="min-w-0 truncate rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-700">{currentFactionName}</span>{remainingPosts != null && <span className="hidden shrink-0 text-xs font-semibold text-slate-500 md:block">残り{remainingPosts}回</span>}<span className={`ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${canPost ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>{canPost ? "＋ 意見を書く" : postDisabledReason ?? "発言不可"}</span></button>}
        </section>
      </div>
    </div>
  </div>;
}
