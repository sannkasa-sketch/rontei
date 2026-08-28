"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { joinTopic, joinWerewolfTopic } from "@/app/topics/actions";
import { generateRandomSpeakerName } from "@/lib/speaker-name";
import { nameModeDescriptions, nameModeLabels, type NameMode } from "@/lib/topic-rules";
import { isFixedRoleDebateType } from "@/lib/debate-format";

type FactionOption = { id: string; name: string };

export function JoinTopicForm({ slug, factions, nameMode, accountName, debateType, shuffleFactions = false }: { slug: string; factions: FactionOption[]; nameMode: NameMode; accountName: string | null; debateType: string; shuffleFactions?: boolean }) {
  const router = useRouter();
  const initialized = useRef(false);
  const [speakerName, setSpeakerName] = useState("");
  const [werewolfNames, setWerewolfNames] = useState<[string, string]>(["", ""]);
  const [primaryFactionId, setPrimaryFactionId] = useState(factions[0]?.id ?? "");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const accountNameMissing = nameMode === "account" && !accountName;
  const fixedRoles = isFixedRoleDebateType(debateType);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (nameMode === "topic_alias") setSpeakerName(generateRandomSpeakerName());
    if (nameMode === "werewolf") {
      const first = generateRandomSpeakerName();
      let second = generateRandomSpeakerName();
      while (second === first) second = generateRandomSpeakerName();
      setWerewolfNames([first, second]);
    }
  }, [nameMode]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await joinTopic(slug, String(form.get("speakerName") ?? ""), shuffleFactions ? factions[0]?.id ?? "" : fixedRoles ? factions[1]?.id ?? "" : String(form.get("factionId") ?? ""));
      setMessage(result.message);
      if (result.success || result.message.includes("評価ポイント") || result.message.includes("終了")) router.refresh();
    });
  }

  function submitWerewolf(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (factions.length !== 2) { setMessage("人狼記名には2つの派閥が必要です。"); return; }
    startTransition(async () => {
      const result = await joinWerewolfTopic(slug, primaryFactionId, factions[0].id, werewolfNames[0], factions[1].id, werewolfNames[1]);
      setMessage(result.message);
      if (result.success || result.message.includes("評価ポイント") || result.message.includes("終了")) router.refresh();
    });
  }

  return <section className="panel mt-10 p-5 sm:p-7"><p className="section-kicker">JOIN DISCUSSION</p><h2 className="text-lg font-black text-slate-900">この討論に参加する</h2><div className="mt-4 rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-500">記名方式</p><p className="mt-1 font-black text-slate-900">{nameModeLabels[nameMode]}</p><p className="mt-1 text-xs leading-5 text-slate-500">{nameModeDescriptions[nameMode]}</p></div>
    {nameMode === "werewolf" ? <form onSubmit={submitWerewolf} className="mt-5 grid gap-5 sm:grid-cols-2">
      {factions.slice(0, 2).map((faction, index) => <label key={faction.id} className="block text-xs font-bold text-slate-700">{faction.name}側の発言名<input data-testid={`werewolf-alias-${index + 1}`} value={werewolfNames[index]} onChange={(event) => setWerewolfNames((current) => index === 0 ? [event.target.value, current[1]] : [current[0], event.target.value])} minLength={2} maxLength={30} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm font-normal" /></label>)}
      <label className="block text-xs font-bold text-slate-700 sm:col-span-2">最初に表示する立場<select data-testid="werewolf-primary-faction" value={primaryFactionId} onChange={(event) => setPrimaryFactionId(event.target.value)} required className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal"><option value="">選択してください</option>{factions.slice(0, 2).map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></label>
      {message && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:col-span-2">{message}</p>}
      <div className="sm:col-span-2"><button data-testid="werewolf-join-submit" disabled={pending || factions.length !== 2 || werewolfNames.some((name) => name.trim().length < 2)} className="button-primary disabled:cursor-not-allowed disabled:opacity-60">{pending ? "参加処理中…" : "この討論に参加する"}</button></div>
    </form> : accountNameMissing ? <div className="mt-5 rounded-lg bg-amber-50 px-4 py-4"><p className="text-sm font-semibold leading-6 text-amber-900">完全記名の討論に参加するには、先にアカウント名を設定してください。</p><Link href="/mypage" className="mt-3 inline-block text-sm font-bold text-blue-700 hover:text-blue-900">マイページで設定する →</Link></div> : <form onSubmit={submit} className="mt-5 grid gap-5 sm:grid-cols-2">
      {nameMode === "topic_alias" && <label className="block text-xs font-bold text-slate-700">発言名<input name="speakerName" data-testid="join-speaker-name" value={speakerName} onChange={(event) => setSpeakerName(event.target.value)} minLength={2} maxLength={30} required placeholder="2〜30文字" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-3 text-sm font-normal" /></label>}
      {nameMode === "anonymous" && <div className="text-sm text-slate-600 sm:col-span-2">発言には名前が表示されません。</div>}
      {nameMode === "account" && <div className="text-sm text-slate-600 sm:col-span-2">表示名：<b className="text-slate-900">{accountName}</b></div>}
      {shuffleFactions ? <div data-testid="join-shuffled-faction" className="rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-slate-700"><span className="text-xs font-bold text-slate-500">参加時の派閥</span><p className="mt-1 font-black text-slate-900">シャッフルで決定</p><p className="mt-1 text-xs">参加時にDB側でランダムに1つの派閥へ所属します。</p></div> : fixedRoles ? <div data-testid="join-fixed-faction" className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-slate-700"><span className="text-xs font-bold text-slate-500">参加時の役割</span><p className="mt-1 font-black text-slate-900">{factions[1]?.name ?? "参加者"}</p><p className="mt-1 text-xs">参加すると自動的にこの役割へ所属します。</p></div> : <label className="block text-xs font-bold text-slate-700">派閥<select name="factionId" data-testid="join-faction-select" required disabled={factions.length === 0} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal disabled:bg-slate-100"><option value="">選択してください</option>{factions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}</select></label>}
      {message && <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 sm:col-span-2">{message}</p>}
      <div className="sm:col-span-2"><button data-testid="join-topic-submit" disabled={pending || factions.length === 0} className="button-primary disabled:cursor-not-allowed disabled:opacity-60">{pending ? "参加処理中…" : "参加する"}</button></div>
    </form>}
  </section>;
}
