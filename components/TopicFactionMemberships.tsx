"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMyTopicFaction, removeMyTopicFaction } from "@/app/topics/actions";
import type { MyTopicFaction } from "@/lib/topic-memberships";

type FactionOption = { id: string; name: string };

export function TopicFactionMemberships({ slug, memberships, allFactions }: {
  slug: string;
  memberships: MyTopicFaction[];
  allFactions: FactionOption[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState<MyTopicFaction | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const memberIds = useMemo(() => new Set(memberships.map((faction) => faction.faction_id)), [memberships]);
  const available = allFactions.filter((faction) => !memberIds.has(faction.id));

  function add() {
    if (!selectedId) return;
    startTransition(async () => {
      const result = await addMyTopicFaction(slug, selectedId);
      setMessage(result.message);
      if (result.success) {
        setAdding(false);
        setSelectedId("");
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirmRemoval) return;
    startTransition(async () => {
      const result = await removeMyTopicFaction(slug, confirmRemoval.faction_id);
      setMessage(result.message);
      if (result.success) {
        setConfirmRemoval(null);
        router.refresh();
      }
    });
  }

  return <div data-testid="member-factions" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-black tracking-wide text-slate-500">所属派閥</p>
    <ul className="mt-3 space-y-2">{memberships.map((faction) => <li key={faction.faction_id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm"><span aria-hidden>{faction.is_primary ? "★" : "✓"}</span><b className="text-slate-900">{faction.faction_name}</b>{faction.is_primary ? <span className="text-xs font-semibold text-slate-400">メイン</span> : <button type="button" onClick={() => { setConfirmRemoval(faction); setAdding(false); setMessage(""); }} className="ml-auto text-xs font-bold text-slate-500 hover:text-rose-700">解除</button>}</li>)}</ul>

    {!adding && !confirmRemoval && available.length > 0 && <button type="button" data-testid="add-member-faction-open" onClick={() => { setAdding(true); setMessage(""); }} className="mt-3 text-xs font-bold text-blue-700 hover:text-blue-900">＋ 所属派閥を追加</button>}
    {adding && <div className="mt-4 border-t border-slate-200 pt-4"><label className="block text-xs font-bold text-slate-700">追加する派閥<select data-testid="add-member-faction-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal"><option value="">選択してください</option>{available.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></label><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setAdding(false); setSelectedId(""); }} disabled={pending} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button><button type="button" data-testid="add-member-faction-submit" onClick={add} disabled={pending || !selectedId} className="button-primary !min-h-9 !px-3 !py-2 disabled:opacity-50">{pending ? "追加中…" : "所属する"}</button></div></div>}
    {confirmRemoval && <div className="mt-4 border-t border-slate-200 pt-4"><p className="text-sm font-semibold text-slate-800">{confirmRemoval.faction_name}への所属を解除しますか？</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setConfirmRemoval(null)} disabled={pending} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button><button type="button" onClick={remove} disabled={pending} className="button-primary !min-h-9 !px-3 !py-2 disabled:opacity-50">{pending ? "解除中…" : "解除する"}</button></div></div>}
    {message && <p role="status" className={`mt-3 text-xs font-semibold ${message.includes("しました") ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}
  </div>;
}
