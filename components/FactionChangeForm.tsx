"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeTopicFaction } from "@/app/topics/actions";

type FactionOption = { id: string; name: string };

export function FactionChangeForm({ slug, currentFactionId, currentFactionName, factions }: {
  slug: string;
  currentFactionId: string | null;
  currentFactionName: string;
  factions: FactionOption[];
}) {
  const router = useRouter();
  const choices = useMemo(() => factions.filter((faction) => faction.id !== currentFactionId), [factions, currentFactionId]);
  const [stage, setStage] = useState<"closed" | "select" | "confirm">("closed");
  const [newFactionId, setNewFactionId] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const newFaction = choices.find((faction) => faction.id === newFactionId);

  function cancel() {
    setStage("closed");
    setNewFactionId("");
    setMessage("");
  }

  function move() {
    if (!newFaction) return;
    startTransition(async () => {
      const result = await changeTopicFaction(slug, newFaction.id);
      setMessage(result.message);
      if (result.success) {
        setStage("closed");
        setNewFactionId("");
        router.refresh();
      } else if (result.message.includes("終了") || result.message.includes("許可")) {
        router.refresh();
      }
    });
  }

  if (stage === "closed") return <div className="mt-4"><button type="button" data-testid="faction-change-open" onClick={() => { setStage("select"); setMessage(""); }} className="button-secondary !min-h-9 !px-3 !py-2 text-xs">派閥を変更する</button>{message && <p role="status" className="mt-2 text-xs font-semibold text-emerald-700">{message}</p>}</div>;

  return <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <p className="text-xs font-bold text-slate-500">現在の派閥</p>
    <p className="mt-1 text-sm font-black text-slate-900">{currentFactionName}</p>
    {stage === "select" ? <>
      <label className="mt-4 block text-xs font-bold text-slate-700">移動先<select data-testid="faction-change-select" value={newFactionId} onChange={(event) => setNewFactionId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal"><option value="">選択してください</option>{choices.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></label>
      <div className="mt-4 flex gap-2"><button type="button" onClick={cancel} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button><button type="button" disabled={!newFaction} onClick={() => setStage("confirm")} className="button-primary !min-h-9 !px-3 !py-2 disabled:opacity-50">派閥を変更</button></div>
    </> : <>
      <p className="mt-4 text-sm font-semibold leading-6 text-slate-800">{currentFactionName}から{newFaction?.name}へ移動します。<br />過去の発言の派閥表示は変更されません。よろしいですか？</p>
      <div className="mt-4 flex gap-2"><button type="button" onClick={() => setStage("select")} disabled={pending} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button><button type="button" data-testid="faction-change-submit" onClick={move} disabled={pending || !newFaction} className="button-primary !min-h-9 !px-3 !py-2 disabled:opacity-50">{pending ? "移動中…" : "移動する"}</button></div>
    </>}
    {message && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{message}</p>}
  </div>;
}
