"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTopic } from "@/app/topics/new/actions";
import { debateTypeOptions } from "@/lib/topic-display";
import { getTopicCategoryLabel, topicCategoryOptions, type TopicCategory } from "@/lib/topic-category";
import { debateFormatDetails, getDefaultFactionNames, isFixedRoleDebateType } from "@/lib/debate-format";
import { generateRandomSpeakerName } from "@/lib/speaker-name";

type FactionInput = { id: number; name: string };
type InactivityUnit = "minutes" | "hours" | "days";

function toLocalDateTimeInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function RuleToggle({ name, title, description, defaultChecked = false, checked, onChange, disabled = false, note }: { name: string; title: string; description: string; defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; note?: string }) {
  const controlProps = checked === undefined ? { defaultChecked } : { checked, onChange: (event: ChangeEvent<HTMLInputElement>) => onChange?.(event.target.checked) };
  return <label className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><input name={name} type="checkbox" disabled={disabled} {...controlProps} className="mt-1 size-4 accent-blue-700" /><span><span className="block text-sm font-bold text-slate-800">{title}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{description}</span>{note && <span className="mt-1 block text-[11px] font-semibold text-amber-700">{note}</span>}</span></label>;
}

export function CreateTopicForm() {
  const router = useRouter();
  const nextFactionId = useRef(3);
  const [factions, setFactions] = useState<FactionInput[]>([{ id: 1, name: "主催" }, { id: 2, name: "参加者" }]);
  const [debateType, setDebateType] = useState("exploration");
  const [nameMode, setNameMode] = useState("topic_alias");
  const [category, setCategory] = useState<TopicCategory>("other");
  const [endsAtValue, setEndsAtValue] = useState("");
  const [endsAtError, setEndsAtError] = useState("");
  const [allowFactionChange, setAllowFactionChange] = useState(false);
  const [allowMultipleFactions, setAllowMultipleFactions] = useState(false);
  const [allowFactionAddition, setAllowFactionAddition] = useState(false);
  const [werewolfRevealMode, setWerewolfRevealMode] = useState<"never" | "after_end">("never");
  const [error, setError] = useState("");
  const [limitPosts, setLimitPosts] = useState(false);
  const [limitPoints, setLimitPoints] = useState(false);
  const [allowDeception, setAllowDeception] = useState(false);
  const [endMode, setEndMode] = useState<"fixed" | "inactivity">("fixed");
  const [inactivityUnit, setInactivityUnit] = useState<InactivityUnit>("minutes");
  const [inactivityValue, setInactivityValue] = useState(30);
  const [shuffleFactions, setShuffleFactions] = useState(false);
  const [showLiveVoteCounts, setShowLiveVoteCounts] = useState(false);
  const [creatorSpeakerName, setCreatorSpeakerName] = useState(() => generateRandomSpeakerName());
  const [formatHelp, setFormatHelp] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fixedDateMin = toLocalDateTimeInput(new Date(Date.now() + 60_000));
  const fixedDateMax = toLocalDateTimeInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));

  useEffect(() => {
    setEndsAtValue((current) => current || toLocalDateTimeInput(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)));
  }, []);

  function updateFaction(id: number, name: string) {
    setFactions((current) => current.map((faction) => faction.id === id ? { ...faction, name } : faction));
  }

  function changeNameMode(mode: string) {
    if (mode === "werewolf" && shuffleFactions) {
      setError("シャッフル中は人狼記名を使用できません");
      return;
    }
    if (mode === "werewolf" && debateType !== "superiority") {
      setError("この討論形式では人狼記名を使用できません");
      return;
    }
    setNameMode(mode);
    if (mode !== "werewolf") return;
    setAllowFactionChange(false);
    setAllowMultipleFactions(false);
    setAllowFactionAddition(false);
    setFactions((current) => {
      const first = current[0] ?? { id: nextFactionId.current++, name: "賛成" };
      const second = current[1] ?? { id: nextFactionId.current++, name: "反対" };
      return [first, second];
    });
  }

  function changeDebateType(type: string) {
    const previousDefaults = getDefaultFactionNames(debateType);
    const nextDefaults = getDefaultFactionNames(type);
    setDebateType(type);
    if (type !== "superiority" && nameMode === "werewolf") {
      setNameMode("topic_alias");
      setError("この討論形式では人狼記名を使用できません。記名方式を議題毎へ変更しました");
    }
    setFactions((current) => {
      const isUneditedDefault = current.length === 2 && current[0].name === previousDefaults[0] && current[1].name === previousDefaults[1];
      const source = isUneditedDefault
        ? current.map((faction, index) => ({ ...faction, name: nextDefaults[index] }))
        : current;
      if (isFixedRoleDebateType(type)) {
        const first = source[0] ?? { id: nextFactionId.current++, name: nextDefaults[0] };
        const second = source[1] ?? { id: nextFactionId.current++, name: nextDefaults[1] };
        return [first, second];
      }
      return source.length >= 2 ? source : [source[0] ?? { id: nextFactionId.current++, name: nextDefaults[0] }, { id: nextFactionId.current++, name: nextDefaults[1] }];
    });
    if (isFixedRoleDebateType(type)) {
      setAllowFactionChange(false);
      setAllowMultipleFactions(false);
      setAllowFactionAddition(false);
      return;
    }
    if (type === "superiority") {
      return;
    }
    if (type !== "binary") return;
    if (nameMode === "werewolf") {
      setNameMode("topic_alias");
      setError("白黒形式では人狼記名を使用できません。記名方式を議題毎へ変更しました");
    }
    setAllowFactionChange(true);
    setAllowFactionAddition(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const names = factions.map((faction) => faction.name.trim()).filter(Boolean);
    const fixedRoles = isFixedRoleDebateType(debateType);
    if (fixedRoles && nameMode === "werewolf") { setError("この討論形式では人狼記名を使用できません"); return; }
    if (fixedRoles && names.length !== 2) { setError("この討論形式では主催側と参加者側の2つの役割を設定してください。"); return; }
    if ((fixedRoles || shuffleFactions) && nameMode === "topic_alias" && (creatorSpeakerName.trim().length < 2 || creatorSpeakerName.trim().length > 30)) { setError("あなたの発言名は2〜30文字で入力してください。"); return; }
    if (debateType === "binary" && nameMode === "werewolf") { setError("白黒形式では人狼記名を使用できません"); return; }
    if (debateType === "binary" && names.length < 2) { setError("白黒形式では派閥を2つ以上設定してください"); return; }
    if (debateType === "superiority" && names.length < 2) { setError("優劣形式では派閥を2つ以上設定してください"); return; }
    if (nameMode === "werewolf" && names.length !== 2) { setError("人狼記名では派閥を2つ設定してください。"); return; }
    if (names.length === 0) { setError("派閥を1つ以上入力してください。"); return; }
    if (new Set(names).size !== names.length) { setError("同じ派閥名を複数使用することはできません。"); return; }

    const localEndsAt = String(form.get("endsAt") ?? "");
    let endsAt: string | null = null;
    if (endMode === "fixed" && localEndsAt) {
      const date = new Date(localEndsAt);
      if (Number.isNaN(date.getTime())) { setEndsAtError("終了日時を確認してください。"); return; }
      const now = Date.now();
      if (date.getTime() <= now) { setEndsAtError("終了日時は現在より未来を指定してください。"); return; }
      if (date.getTime() > now + 14 * 24 * 60 * 60 * 1000) { setEndsAtError("終了日時は現在から2週間以内で指定してください。"); return; }
      setEndsAtError("");
      endsAt = date.toISOString();
    }
    if (endMode === "fixed" && !endsAt) { setEndsAtError("終了日時を指定してください。"); return; }
    const unitMultiplier = inactivityUnit === "minutes" ? 1 : inactivityUnit === "hours" ? 60 : 1440;
    const inactivityMin = inactivityUnit === "minutes" ? 10 : 1;
    const inactivityMax = inactivityUnit === "minutes" ? 50 : inactivityUnit === "hours" ? 23 : 7;
    if (endMode === "inactivity" && (!Number.isInteger(inactivityValue) || inactivityValue < inactivityMin || inactivityValue > inactivityMax)) { setEndsAtError(`値は${inactivityMin}～${inactivityMax}${inactivityUnit === "minutes" ? "分" : inactivityUnit === "hours" ? "時間" : "日"}で入力してください。`); return; }

    const maxPosts = limitPosts ? Number(form.get("maxPostsPerMember")) : null;
    if (maxPosts !== null && (!Number.isInteger(maxPosts) || maxPosts < 1)) { setError("発言回数は1以上の整数で入力してください。"); return; }
    const minPoints = limitPoints ? Number(form.get("minEvaluationPoints")) : null;
    if (minPoints !== null && (!Number.isInteger(minPoints) || minPoints < 0)) { setError("必要評価ポイントは0以上の整数で入力してください。"); return; }

    startTransition(async () => {
      const result = await createTopic({
        title: String(form.get("title") ?? ""),
        summary: String(form.get("summary") ?? ""),
        content: String(form.get("content") ?? ""),
        purpose: String(form.get("purpose") ?? ""),
        debateType,
        category: String(form.get("category") ?? "other") as TopicCategory,
        endsAt,
        factions: names,
        nameMode,
        werewolfRevealMode,
        maxPostsPerMember: maxPosts,
        requireFaction: true,
        allowFactionChange: fixedRoles ? false : debateType === "binary" ? true : nameMode === "werewolf" ? false : allowFactionChange,
        allowMultipleFactions: fixedRoles || nameMode === "werewolf" ? false : allowMultipleFactions,
        allowFactionAddition: fixedRoles || debateType === "binary" || nameMode === "werewolf" ? false : allowFactionAddition,
        allowDeception,
        minEvaluationPoints: minPoints,
        creatorSpeakerName,
        endMode,
        inactivityTimeoutMinutes: endMode === "inactivity" ? inactivityValue * unitMultiplier : null,
        shuffleFactions,
        showLiveVoteCounts,
      });
      if (!result.success) { setError(result.message); return; }
      router.push(`/topics/${encodeURIComponent(result.slug)}`);
      router.refresh();
    });
  }

  const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal";

  return <form onSubmit={submit}><div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-6"><section className="panel p-5 sm:p-7"><p className="section-kicker">TOPIC</p><h2 className="text-lg font-black text-slate-900">1. 議題</h2><div className="mt-6 grid gap-5"><label className="text-sm font-bold text-slate-700">タイトル <span className="text-rose-600">*</span><input name="title" minLength={2} required className={`${inputClass} text-base font-semibold`} placeholder="例：生成AIを学校教育に導入すべきか" /></label><label className="text-sm font-bold text-slate-700">カテゴリ<select name="category" value={category} onChange={(event) => setCategory(event.target.value as TopicCategory)} className={inputClass}>{topicCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label className="text-sm font-bold text-slate-700">概要<span className="mt-1 block text-xs font-normal text-slate-500">一覧カードに表示される短い説明です。</span><textarea name="summary" rows={2} className={inputClass} placeholder="議題を短く説明します（任意）" /></label><label className="text-sm font-bold text-slate-700">本文・詳細 <span className="text-rose-600">*</span><textarea name="content" rows={6} required className={inputClass} placeholder="背景、前提、検討したい論点を入力" /></label><label className="text-sm font-bold text-slate-700">討論の目的<textarea name="purpose" rows={3} className={inputClass} placeholder="何について考えたいか（任意）" /></label></div></section>

    <section className="panel p-5 sm:p-7"><p className="section-kicker">FORMAT</p><h2 className="text-lg font-black text-slate-900">2. 討論形式</h2><select name="debateType" value={debateType} onChange={(event) => changeDebateType(event.target.value)} className="sr-only" aria-label="討論タイプ">{debateTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><div className="mt-5 grid gap-2 sm:grid-cols-2">{[{ value: "exploration", description: "答えを決めず、複数の意見から考えを深める" }, { value: "binary", description: "複数の意見から最終的な多数を決める" }, { value: "superiority", description: "発言評価から派閥の順位を決める" }, { value: "casual", description: "勝敗を決めず気軽に話す" }, { value: "recruitment", description: "提案を募る。返信枝は作らない" }].map((option) => <div key={option.value} className="group relative"><button type="button" aria-pressed={debateType === option.value} onClick={() => changeDebateType(option.value)} onFocus={() => setFormatHelp(option.value)} onMouseEnter={() => setFormatHelp(option.value)} onMouseLeave={() => setFormatHelp((current) => current === option.value ? null : current)} className={`w-full rounded-lg border p-3 pr-11 text-left ${debateType === option.value ? "border-blue-400 bg-blue-50 ring-1 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}><span className="block text-sm font-black text-slate-800">{debateTypeOptions.find((item) => item.value === option.value)?.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span></button><button type="button" aria-label={`${debateTypeOptions.find((item) => item.value === option.value)?.label}の詳細`} aria-expanded={formatHelp === option.value} onClick={() => setFormatHelp((current) => current === option.value ? null : option.value)} className="absolute right-3 top-3 grid size-6 place-items-center rounded-full border border-slate-300 bg-white text-xs font-black text-slate-500">i</button>{formatHelp === option.value && <div role="tooltip" className="absolute left-0 top-full z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-700 shadow-lg">{debateFormatDetails[option.value]}{option.value === "superiority" && <p className="mt-2 font-semibold">納得 +2 ／ 不服 0 ／ 懐疑 -1 ／ 微妙 0</p>}</div>}</div>)}</div>{isFixedRoleDebateType(debateType) && <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-xs font-semibold leading-5 text-blue-800">作成者は「{factions[0]?.name || "主催"}」、ほかの参加者は「{factions[1]?.name || "参加者"}」へ自動的に所属します。</p>}{debateType === "binary" && <p className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-xs font-semibold leading-5 text-blue-800">白黒形式は2派閥以上で作成できます。派閥移動はON、複数所属と討論開始後の派閥追加はOFFです。</p>}{debateType === "superiority" && <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800"><p className="font-semibold">発言が獲得したリアクションポイントの合計で優劣を決定します。</p><p className="mt-1">納得 +2 ／ 不服 0 ／ 懐疑 -1 ／ 微妙 0</p></div>}</section>

    <section className="panel p-5 sm:p-7"><p className="section-kicker">FACTIONS</p><h2 className="text-lg font-black text-slate-900">派閥</h2><p className="mt-2 text-sm text-slate-500">{isFixedRoleDebateType(debateType) ? "名称は編集できますが、作成者側と参加者側の2役に固定されます。" : debateType === "binary" ? "白黒形式では2つ以上の派閥を設定できます。討論開始後の派閥追加はできません。" : nameMode === "werewolf" ? "人狼記名では2つの派閥を設定してください。" : "優劣形式では2つ以上の派閥を設定してください。3つ以上の案も比較できます。"}</p><div className="mt-5 space-y-3">{factions.map((faction, index) => <div key={faction.id} className="flex items-end gap-2"><label className="flex-1 text-xs font-bold text-slate-600">派閥 {index + 1}<input value={faction.name} onChange={(event) => updateFaction(faction.id, event.target.value)} className={inputClass} /></label>{!isFixedRoleDebateType(debateType) && <button type="button" disabled={nameMode === "werewolf" || factions.length <= 2} onClick={() => setFactions((current) => current.filter((item) => item.id !== faction.id))} className="mb-0 min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-bold text-slate-500 hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label={`派閥${index + 1}を削除`}>削除</button>}</div>)}</div>{(debateType === "superiority" || debateType === "binary") && nameMode !== "werewolf" && <button type="button" onClick={() => { const id = nextFactionId.current++; setFactions((current) => [...current, { id, name: "" }]); }} className="button-secondary mt-4">＋ 派閥を追加</button>}<label className={`mt-5 flex items-start gap-3 rounded-lg border p-4 ${nameMode === "werewolf" ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60" : "cursor-pointer border-slate-200 bg-white"}`}><input name="shuffleFactions" type="checkbox" data-testid="shuffle-factions" checked={shuffleFactions} disabled={nameMode === "werewolf"} onChange={(event) => setShuffleFactions(event.target.checked)} className="mt-1 size-4 accent-blue-700" /><span><span className="block text-sm font-black text-slate-800">シャッフル</span><span className="mt-1 block text-xs leading-5 text-slate-500">参加時に登録された派閥の中からランダムに1つの派閥へ所属します。</span>{nameMode === "werewolf" && <span className="mt-1 block text-xs font-bold text-amber-700">人狼記名では使用できません。</span>}</span></label></section>

    <div className="pt-3"><p className="section-kicker">DISCUSSION RULES</p><h2 className="section-title">討論ルール</h2><p className="mt-2 text-sm leading-6 text-slate-500">議論の進め方、参加条件、発言時のルールを設定します。</p></div>

    <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">記名ルール</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
      { value: "anonymous", label: "完全匿名", description: "発言者の名前を表示しません" },
      { value: "topic_alias", label: "議題毎", description: "この議題だけで使用する発言名を設定します。" },
      { value: "account", label: "完全記名", description: "アカウント名を表示します" },
      { value: "werewolf", label: "人狼", description: "所属した派閥ごとに別の発言名が設定されます。" },
    ].map((mode) => { const unavailable = mode.value === "werewolf" && debateType !== "superiority"; return <label key={mode.value} className={`flex items-start gap-3 rounded-lg border border-slate-200 p-4 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50 ${unavailable ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><input type="radio" name="nameMode" value={mode.value} checked={nameMode === mode.value} disabled={unavailable} onChange={() => changeNameMode(mode.value)} className="mt-1 accent-blue-700" /><span><span className="block text-sm font-bold text-slate-800">{mode.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{mode.description}</span>{unavailable && <span className="mt-2 block text-xs font-bold text-amber-700">この討論形式では人狼記名を使用できません</span>}</span></label>; })}</div>{isFixedRoleDebateType(debateType) && nameMode === "topic_alias" && <label className="mt-5 block max-w-sm text-sm font-bold text-slate-700">あなたの発言名<input name="creatorSpeakerName" data-testid="creator-speaker-name" value={creatorSpeakerName} onChange={(event) => setCreatorSpeakerName(event.target.value)} minLength={2} maxLength={30} required className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">作成後、派閥1「{factions[0]?.name || "主催"}」として自動参加します。</span></label>}</section>

    {nameMode === "werewolf" && <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">人狼の正体公開</h3><div className="mt-5 grid gap-3 sm:grid-cols-2">{[
      { value: "never" as const, label: "永久に非公開", description: "討論終了後も、2つの発言名が同一人物であることは公開されません" },
      { value: "after_end" as const, label: "討論終了時に公開", description: "討論中は非公開ですが、討論終了後に2つの発言名の組み合わせが公開されます" },
    ].map((option) => <label key={option.value} className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50"><input type="radio" name="werewolfRevealMode" value={option.value} checked={werewolfRevealMode === option.value} onChange={() => setWerewolfRevealMode(option.value)} className="mt-1 accent-blue-700" /><span><span className="block text-sm font-bold text-slate-800">{option.label}</span><span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span></span></label>)}</div></section>}

    <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">発言制限</h3><label className="mt-5 flex items-center gap-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={limitPosts} onChange={(event) => setLimitPosts(event.target.checked)} className="size-4 accent-blue-700" />発言回数を制限する</label>{limitPosts && <label className="mt-4 block max-w-xs text-xs font-bold text-slate-600">1人あたり<input name="maxPostsPerMember" type="number" min={1} step={1} defaultValue={10} required className={inputClass} /><span className="mt-1 block font-normal text-slate-500">回まで</span></label>}</section>

    {!isFixedRoleDebateType(debateType) && <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">派閥ルール</h3>{shuffleFactions && <p className="mt-2 text-xs font-semibold text-slate-500">シャッフル中は所属派閥をランダムに決定するため、派閥移動・複数所属・派閥追加は利用できません。</p>}{nameMode === "werewolf" && <p className="mt-2 text-xs font-semibold text-slate-500">人狼記名では派閥移動・複数所属・参加者による派閥追加は使用できません。</p>}{debateType === "binary" && !shuffleFactions && <p className="mt-2 text-xs font-semibold text-slate-500">白黒形式では派閥移動が必須で、複数所属・参加者による派閥追加は使用できません。</p>}<div className="mt-5 grid gap-3 sm:grid-cols-2"><RuleToggle name="allowFactionChange" title="派閥の移動を許可する" description={debateType === "binary" ? "白黒形式では許可に固定されます" : "参加後に所属派閥を変更できます"} checked={shuffleFactions ? false : debateType === "binary" ? true : allowFactionChange} onChange={setAllowFactionChange} disabled={shuffleFactions || debateType === "binary" || nameMode === "werewolf"} /><RuleToggle name="allowMultipleFactions" title="複数の派閥への所属を許可する" description={debateType === "binary" ? "白黒形式では不許可に固定されます" : "同時に複数の派閥へ所属できます"} checked={shuffleFactions || debateType === "binary" ? false : allowMultipleFactions} onChange={setAllowMultipleFactions} disabled={shuffleFactions || debateType === "binary" || nameMode === "werewolf"} /><RuleToggle name="allowFactionAddition" title="参加者による派閥追加を許可する" description={debateType === "binary" ? "白黒形式では不許可に固定されます" : "討論開始後に参加者が派閥を追加できます"} checked={shuffleFactions || debateType === "binary" ? false : allowFactionAddition} onChange={setAllowFactionAddition} disabled={shuffleFactions || debateType === "binary" || nameMode === "werewolf"} /></div></section>}

    <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">特殊ルール</h3><div className="mt-5"><RuleToggle name="allowDeception" title="意図的な虚偽発言を許可する" description="この討論では、ルール上意図的な嘘の発言を許可します" note="有効にすると、この討論では「懐疑」リアクションを使用できません" checked={allowDeception} onChange={setAllowDeception} /></div></section>

    <section className="panel p-5 sm:p-7"><h3 className="text-lg font-black text-slate-900">評価ポイント制限</h3><label className="mt-5 flex items-center gap-3 text-sm font-bold text-slate-800"><input type="checkbox" checked={limitPoints} onChange={(event) => setLimitPoints(event.target.checked)} className="size-4 accent-blue-700" />参加・発言に必要な評価ポイントを設定する</label>{limitPoints && <label className="mt-4 block max-w-xs text-xs font-bold text-slate-600">必要ポイント<input name="minEvaluationPoints" type="number" min={0} step={1} defaultValue={10} required className={inputClass} /><span className="mt-1 block font-normal text-slate-500">pt</span></label>}<p className="mt-3 text-[11px] font-semibold text-slate-500">設定したポイントは参加時と発言時の両方で確認されます。</p></section>

    {debateType === "binary" && <section className="panel p-5 sm:p-7" data-testid="binary-live-vote-setting">
      <h3 className="text-lg font-black text-slate-900">討論中の票数</h3>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className={`rounded-lg border p-4 ${showLiveVoteCounts ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
          <span className="flex items-center gap-2 text-sm font-black text-slate-800"><input type="radio" name="showLiveVoteCounts" value="true" checked={showLiveVoteCounts} onChange={() => setShowLiveVoteCounts(true)} className="accent-blue-700" />公開する</span>
          <span className="mt-2 block text-xs leading-5 text-slate-500">討論中も各派閥の現在の所属人数を表示します。</span>
        </label>
        <label className={`rounded-lg border p-4 ${!showLiveVoteCounts ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
          <span className="flex items-center gap-2 text-sm font-black text-slate-800"><input type="radio" name="showLiveVoteCounts" value="false" checked={!showLiveVoteCounts} onChange={() => setShowLiveVoteCounts(false)} className="accent-blue-700" />終了まで非公開</span>
          <span className="mt-2 block text-xs leading-5 text-slate-500">討論終了まで各派閥の所属人数を表示しません。</span>
        </label>
      </div>
    </section>}

    <section className="panel p-5 sm:p-7">
      <p className="section-kicker">ENDING</p><h2 className="text-lg font-black text-slate-900">6. 終了条件</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <label className={`rounded-lg border p-3 text-sm font-bold ${endMode === "fixed" ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="endMode" value="fixed" checked={endMode === "fixed"} onChange={() => { setEndMode("fixed"); setEndsAtValue((current) => current || toLocalDateTimeInput(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))); }} className="mr-2 accent-blue-700" />終了日時を指定</label>
        <label className={`rounded-lg border p-3 text-sm font-bold ${endMode === "inactivity" ? "border-blue-300 bg-blue-50" : "border-slate-200"}`}><input type="radio" name="endMode" value="inactivity" checked={endMode === "inactivity"} onChange={() => { setEndMode("inactivity"); setEndsAtError(""); }} className="mr-2 accent-blue-700" />最終発言から一定時間で終了</label>
      </div>
      {endMode === "fixed" ? <label className="mt-4 block text-sm font-bold text-slate-700">終了日時<input name="endsAt" data-testid="topic-ends-at" type="datetime-local" min={fixedDateMin} max={fixedDateMax} value={endsAtValue} onChange={(event) => { setEndsAtValue(event.target.value); setEndsAtError(""); }} className={inputClass} /><span className="mt-2 block text-xs font-normal text-slate-500">現在から2週間以内で指定できます。初期値は3日後です。</span></label> : <div className="mt-4"><p className="text-xs font-semibold text-slate-500">設定可能範囲：10分 ～ 7日（分 10～50 ／ 時間 1～23 ／ 日 1～7）</p><div className="mt-3 grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold text-slate-700">単位<select data-testid="inactivity-unit" value={inactivityUnit} onChange={(event) => { const unit = event.target.value as InactivityUnit; setInactivityUnit(unit); setInactivityValue(unit === "minutes" ? 30 : unit === "hours" ? 6 : 1); setEndsAtError(""); }} className={inputClass}><option value="minutes">分</option><option value="hours">時間</option><option value="days">日</option></select></label><label className="text-sm font-bold text-slate-700">値<input data-testid="inactivity-value" type="number" value={inactivityValue} min={inactivityUnit === "minutes" ? 10 : 1} max={inactivityUnit === "minutes" ? 50 : inactivityUnit === "hours" ? 23 : 7} step={1} onChange={(event) => { setInactivityValue(Number(event.target.value)); setEndsAtError(""); }} className={inputClass} /></label></div></div>}
      {endsAtError && <p className="mt-2 text-xs font-semibold text-rose-700">{endsAtError}</p>}
    </section>
    {error && <p role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-700">{error}</p>}</div>
    <aside className="panel p-5 lg:sticky lg:top-24"><p className="section-kicker">CURRENT SETTINGS</p><h2 className="text-lg font-black text-slate-900">現在の設定</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">討論形式</dt><dd className="font-bold text-slate-800">{debateTypeOptions.find((option) => option.value === debateType)?.label}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">カテゴリ</dt><dd className="font-bold text-slate-800">{getTopicCategoryLabel(category)}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">参加方法</dt><dd className="font-bold text-slate-800">{{ anonymous: "完全匿名", topic_alias: "議題毎", account: "完全記名", werewolf: "人狼" }[nameMode]}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">派閥</dt><dd className="font-bold text-slate-800">{factions.length}件{shuffleFactions ? "・シャッフル" : ""}</dd></div>{isFixedRoleDebateType(debateType) && !shuffleFactions && <><div className="flex justify-between gap-3"><dt className="text-slate-500">作成者</dt><dd className="font-bold text-slate-800">{factions[0]?.name || "主催"}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">ほかの参加者</dt><dd className="font-bold text-slate-800">{factions[1]?.name || "参加者"}</dd></div></>}<div className="flex justify-between gap-3"><dt className="text-slate-500">終了</dt><dd className="text-right font-bold text-slate-800">{endMode === "inactivity" ? `最終発言から${inactivityValue}${inactivityUnit === "minutes" ? "分" : inactivityUnit === "hours" ? "時間" : "日"}` : endsAtValue ? new Date(endsAtValue).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "日時を設定"}</dd></div>{debateType === "binary" && <div className="flex justify-between gap-3"><dt className="text-slate-500">途中票数</dt><dd className="font-bold text-slate-800">{showLiveVoteCounts ? "公開" : "終了まで非公開"}</dd></div>}</dl><div className="mt-5 grid grid-cols-2 gap-2 text-[11px] font-bold"><span>移動 {shuffleFactions || isFixedRoleDebateType(debateType) ? "OFF" : debateType === "binary" ? "ON" : nameMode === "werewolf" ? "OFF" : allowFactionChange ? "ON" : "OFF"}</span><span>複数 {shuffleFactions || isFixedRoleDebateType(debateType) || debateType === "binary" || nameMode === "werewolf" ? "OFF" : allowMultipleFactions ? "ON" : "OFF"}</span><span>追加 {shuffleFactions || isFixedRoleDebateType(debateType) || debateType === "binary" || nameMode === "werewolf" ? "OFF" : allowFactionAddition ? "ON" : "OFF"}</span><span>虚偽 {allowDeception ? "ON" : "OFF"}</span></div></aside></div>
    <div className="mt-7 flex justify-end"><button type="submit" data-testid="topic-create-submit" disabled={pending} className="button-primary min-w-40 disabled:cursor-wait disabled:opacity-60">{pending ? "作成しています…" : "議題を作成"}</button></div>
  </form>;
}
