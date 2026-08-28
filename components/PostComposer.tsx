"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createDebatePost, type CreatePostRelation } from "@/app/topics/actions";
import type { MyTopicFaction } from "@/lib/topic-memberships";
import { postRelationLabels } from "@/lib/post-relations";

const relationNames: Record<CreatePostRelation, string> = { ...postRelationLabels, main: "意見" };

export function PostComposer({ slug, factions, primaryFactionId, allowFactionSelection, relationType = "main", parentPostId = null, compact = false, onCancel, onSuccess }: { slug: string; factions: MyTopicFaction[]; primaryFactionId: string; allowFactionSelection: boolean; relationType?: CreatePostRelation; parentPostId?: string | null; compact?: boolean; onCancel?: () => void; onSuccess?: () => void }) {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const initialFactionId = factions.find((faction) => faction.is_primary)?.faction_id || primaryFactionId || factions[0]?.faction_id || "";
  const [factionId, setFactionId] = useState(initialFactionId);
  const selectedFaction = factions.find((faction) => faction.faction_id === factionId);

  useEffect(() => {
    if (!factions.some((faction) => faction.faction_id === factionId)) setFactionId(initialFactionId);
  }, [factionId, factions, initialFactionId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) { setSuccess(false); setMessage("発言内容を入力してください。"); return; }
    if (content.length > 5000) { setSuccess(false); setMessage("発言内容は5000文字以内で入力してください。"); return; }

    startTransition(async () => {
      const result = await createDebatePost(slug, content, parentPostId, relationType, factionId);
      setSuccess(result.success);
      setMessage(result.message);
      if (result.success) {
        setContent("");
        onSuccess?.();
        router.refresh();
      } else if (result.message.includes("発言回数上限") || result.message.includes("評価ポイント") || result.message.includes("終了") || result.message.includes("募集形式")) {
        router.refresh();
      }
    });
  }

  return <form onSubmit={submit} className={compact ? "mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4" : ""}>
    {compact && <p className="mb-3 text-xs font-black text-slate-700">{relationNames[relationType]}を書く</p>}
    {allowFactionSelection && factions.length > 1 && <label className="mb-3 block text-xs font-bold text-slate-700">発言する立場<select data-testid={relationType === "main" ? "post-faction-select" : undefined} value={factionId} onChange={(event) => setFactionId(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal">{factions.map((faction) => <option key={faction.faction_id} value={faction.faction_id}>{faction.faction_name}{faction.is_primary ? "（メイン）" : ""}</option>)}</select></label>}
    {selectedFaction?.speaker_name && <p className="mb-3 text-xs font-semibold text-slate-600">発言名：<b className="text-slate-900">{selectedFaction.speaker_name}</b></p>}
    <textarea data-testid={relationType === "main" ? "main-post-content" : `reply-content-${relationType}`} value={content} onChange={(event) => { setContent(event.target.value); setMessage(""); }} rows={compact ? 4 : 6} maxLength={5000} placeholder={compact ? `${relationNames[relationType]}の内容を入力` : "根拠や具体例を添えて意見を書きましょう"} className="w-full resize-y rounded-lg border border-slate-300 bg-white p-4 text-sm leading-6 placeholder:text-slate-400" />
    <div className="mt-2 flex items-center justify-between gap-3"><span className={`text-xs ${content.length >= 4800 ? "font-bold text-orange-700" : "text-slate-400"}`}>{content.length} / 5000</span><div className="flex gap-2">{onCancel && <button type="button" onClick={onCancel} disabled={pending} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button>}<button type="submit" data-testid={relationType === "main" ? "main-post-submit" : `reply-submit-${relationType}`} disabled={pending || content.trim().length === 0 || !factionId} className="button-primary !min-h-9 !px-4 !py-2 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "送信中…" : compact ? "返信する" : "発言する"}</button></div></div>
    {message && <p role="status" className={`mt-3 text-sm font-semibold ${success ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}
  </form>;
}
