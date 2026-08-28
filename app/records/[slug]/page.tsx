import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactionBadge } from "@/components/FactionBadge";
import { CategoryBadge } from "@/components/CategoryBadge";
import { FactionChangeEventCard } from "@/components/FactionChangeEventCard";
import { PostCard } from "@/components/PostCard";
import { MainPostNavigator } from "@/components/MainPostNavigator";
import type { FactionChangeEvent } from "@/lib/faction-events";
import { buildPostTree, type Post } from "@/lib/posts";
import { createMyReactionMap, createReactionCountMap, type MyPostReactionRow, type PostReactionCountsRow } from "@/lib/post-reactions";
import { createClient } from "@/lib/supabase/server";
import { getTopicCategoryPresentation } from "@/lib/topic-category";
import { formatTopicEndDate, getDebateTypeLabel, isTopicEnded } from "@/lib/topic-display";
import { nameModeLabels, type NameMode, type WerewolfRevealMode } from "@/lib/topic-rules";
import type { WerewolfRevealPair } from "@/lib/werewolf-reveal";

export const dynamic = "force-dynamic";

type Topic = { id: string; slug: string; title: string; summary: string | null; content: string | null; purpose: string | null; debate_type: string; category: string | null; status: string; created_at: string; ends_at: string | null; last_post_at: string | null };
type Faction = { id: string; name: string; sort_order: number };
type Rules = {
  name_mode: NameMode;
  max_posts_per_member: number | null;
  require_faction: boolean;
  allow_faction_change: boolean;
  allow_multiple_factions: boolean;
  allow_faction_addition: boolean;
  allow_deception: boolean;
  min_evaluation_points: number | null;
  werewolf_reveal_mode: WerewolfRevealMode;
  end_mode: "fixed" | "inactivity";
  inactivity_timeout_minutes: number | null;
  shuffle_factions: boolean;
};

type TopicRecordSummary = {
  participant_count: number;
  total_posts: number;
  main_posts: number;
  reply_posts: number;
  faction_change_count: number;
  reaction_agree_count: number;
  reaction_dissatisfied_count: number;
  reaction_skeptical_count: number;
  reaction_uncertain_count: number;
};

type TopicFactionSummary = {
  faction_id: string;
  faction_name: string;
  primary_member_count: number;
  post_count: number;
};

type BinaryFinalResult = {
  faction_id: string;
  faction_name: string;
  vote_count: number;
  total_votes: number;
  unassigned_count: number;
  result_rank: number;
};

type SuperiorityFinalResult = {
  faction_id: string;
  faction_name: string;
  points: number;
  post_count: number;
  result_rank: number;
};

const emptyRecordSummary: TopicRecordSummary = {
  participant_count: 0,
  total_posts: 0,
  main_posts: 0,
  reply_posts: 0,
  faction_change_count: 0,
  reaction_agree_count: 0,
  reaction_dissatisfied_count: 0,
  reaction_skeptical_count: 0,
  reaction_uncertain_count: 0,
};

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function normalizeRecordSummary(data: unknown): TopicRecordSummary {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return emptyRecordSummary;
  const row = value as Record<string, unknown>;
  return {
    participant_count: safeCount(row.participant_count),
    total_posts: safeCount(row.total_posts),
    main_posts: safeCount(row.main_posts),
    reply_posts: safeCount(row.reply_posts),
    faction_change_count: safeCount(row.faction_change_count),
    reaction_agree_count: safeCount(row.reaction_agree_count),
    reaction_dissatisfied_count: safeCount(row.reaction_dissatisfied_count),
    reaction_skeptical_count: safeCount(row.reaction_skeptical_count),
    reaction_uncertain_count: safeCount(row.reaction_uncertain_count),
  };
}

function normalizeFactionSummary(data: unknown): TopicFactionSummary[] {
  if (!Array.isArray(data)) return [];
  return data.map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      faction_id: String(row.faction_id ?? ""),
      faction_name: String(row.faction_name ?? "派閥名なし"),
      primary_member_count: safeCount(row.primary_member_count),
      post_count: safeCount(row.post_count),
    };
  });
}

function normalizeBinaryFinalResult(data: unknown): BinaryFinalResult[] {
  if (!Array.isArray(data)) return [];
  return data.map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      faction_id: String(row.faction_id ?? ""),
      faction_name: String(row.faction_name ?? "派閥名なし"),
      vote_count: safeCount(row.vote_count),
      total_votes: safeCount(row.total_votes),
      unassigned_count: safeCount(row.unassigned_count),
      result_rank: safeCount(row.result_rank),
    };
  }).sort((a, b) => a.result_rank - b.result_rank || b.vote_count - a.vote_count);
}

function normalizeSuperiorityFinalResult(data: unknown): SuperiorityFinalResult[] {
  if (!Array.isArray(data)) return [];
  return data.map((value) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return {
      faction_id: String(row.faction_id ?? ""),
      faction_name: String(row.faction_name ?? "派閥名なし"),
      points: safeCount(row.points),
      post_count: safeCount(row.post_count),
      result_rank: safeCount(row.result_rank),
    };
  }).sort((a, b) => a.result_rank - b.result_rank || b.points - a.points);
}

const defaultRules: Rules = { name_mode: "topic_alias", max_posts_per_member: null, require_faction: true, allow_faction_change: false, allow_multiple_factions: false, allow_faction_addition: false, allow_deception: false, min_evaluation_points: null, werewolf_reveal_mode: "never", end_mode: "fixed", inactivity_timeout_minutes: null, shuffle_factions: false };

const getRecordTopic = cache(async (slug: string): Promise<Topic | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("topics").select("id, slug, title, summary, content, purpose, debate_type, category, status, created_at, ends_at, last_post_at").eq("slug", slug).maybeSingle();
  if (error) throw new Error("Failed to fetch record topic");
  return data as Topic | null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getRecordTopic(slug);
  if (!topic) return { title: "討論記録" };
  const description = topic.summary ?? "終了した討論の公開議事録です。";
  return { title: `${topic.title} — 議事録`, description, openGraph: { type: "article", siteName: "論庭", title: topic.title, description } };
}

async function getRecordData(topicId: string, debateType: string) {
  const supabase = await createClient();
  const finalResultPromise = debateType === "binary"
    ? supabase.rpc("get_binary_final_result", { p_topic_id: topicId })
    : debateType === "superiority"
      ? supabase.rpc("get_superiority_final_result", { p_topic_id: topicId })
      : Promise.resolve({ data: [], error: null });
  const [factionsResult, postsResult, rulesResult, countsResult, eventsResult, recordSummaryResult, factionSummaryResult, finalResult, claimsResult] = await Promise.all([
    supabase.from("factions").select("id, name, sort_order").eq("topic_id", topicId).order("sort_order", { ascending: true }),
    supabase.from("posts").select("id, topic_id, faction_id, previous_faction_id, parent_post_id, relation_type, author_name, content, created_at").eq("topic_id", topicId),
    supabase.from("topic_rules").select("name_mode, max_posts_per_member, require_faction, allow_faction_change, allow_multiple_factions, allow_faction_addition, allow_deception, min_evaluation_points, werewolf_reveal_mode, end_mode, inactivity_timeout_minutes, shuffle_factions").eq("topic_id", topicId).maybeSingle(),
    supabase.rpc("get_post_reaction_counts", { p_topic_id: topicId }),
    supabase.rpc("get_faction_change_events", { p_topic_id: topicId }),
    supabase.rpc("get_topic_record_summary", { p_topic_id: topicId }),
    supabase.rpc("get_topic_faction_summary", { p_topic_id: topicId }),
    finalResultPromise,
    supabase.auth.getClaims(),
  ]);
  const loggedIn = Boolean(claimsResult.data?.claims?.sub) && !claimsResult.error;
  const myReactionsResult = loggedIn ? await supabase.rpc("get_my_post_reactions", { p_topic_id: topicId }) : { data: [], error: null };
  return {
    factions: (factionsResult.data ?? []) as Faction[], factionsFailed: Boolean(factionsResult.error),
    posts: (postsResult.data ?? []) as Post[], postsFailed: Boolean(postsResult.error),
    rules: rulesResult.error || !rulesResult.data ? defaultRules : { ...defaultRules, ...rulesResult.data } as Rules,
    counts: (countsResult.data ?? []) as PostReactionCountsRow[], countsFailed: Boolean(countsResult.error),
    events: (eventsResult.data ?? []) as FactionChangeEvent[], eventsFailed: Boolean(eventsResult.error),
    recordSummary: normalizeRecordSummary(recordSummaryResult.data),
    factionSummary: normalizeFactionSummary(factionSummaryResult.data),
    summaryFailed: Boolean(recordSummaryResult.error || factionSummaryResult.error),
    binaryFinalResult: debateType === "binary" ? normalizeBinaryFinalResult(finalResult.data) : [],
    superiorityFinalResult: debateType === "superiority" ? normalizeSuperiorityFinalResult(finalResult.data) : [],
    finalResultFailed: Boolean(finalResult.error),
    myReactions: (myReactionsResult.data ?? []) as MyPostReactionRow[], canReact: loggedIn,
  };
}

async function getRevealPairs(topicId: string): Promise<{ pairs: WerewolfRevealPair[]; failed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_werewolf_reveal_pairs", { p_topic_id: topicId });
  return { pairs: (data ?? []) as WerewolfRevealPair[], failed: Boolean(error) };
}

function RuleValue({ label, value }: { label: string; value: string }) {
  return <div className="record-rule-value flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"><dt className="truncate text-[11px] font-bold text-slate-500">{label}</dt><dd className="shrink-0 text-xs font-black text-slate-800">{value}</dd></div>;
}

function ResultMetric({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div className="record-result-metric flex min-w-0 items-baseline justify-between gap-2 rounded-md bg-slate-50 px-3 py-2"><dt className="truncate text-xs font-bold text-slate-500">{label}</dt><dd className="shrink-0 text-sm font-black text-slate-900">{value.toLocaleString("ja-JP")}<span className="ml-0.5 text-xs font-bold text-slate-500">{suffix}</span></dd></div>;
}

function BinaryFinalResultSection({ rows }: { rows: BinaryFinalResult[] }) {
  const totalVotes = rows[0]?.total_votes ?? 0;
  const unassignedCount = rows[0]?.unassigned_count ?? 0;
  const leaders = totalVotes > 0 ? rows.filter((row) => row.result_rank === 1) : [];
  const resultLabel = totalVotes === 0 ? "結果：判定なし" : leaders.length === 1 ? `結果：${leaders[0].faction_name}` : "結果：引き分け";

  return <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-blue-700">OFFICIAL RESULT</p><h3 className="mt-1 text-lg font-black text-slate-950">最終多数決</h3></div><p className="rounded-full bg-white px-4 py-2 text-sm font-black text-blue-800 shadow-sm">{resultLabel}</p></div>
    <div className="mt-4 space-y-2">{rows.map((row) => {
      const percentage = totalVotes > 0 ? row.vote_count / totalVotes * 100 : 0;
      return <article key={row.faction_id || row.faction_name} className="rounded-lg border border-blue-100 bg-white px-4 py-3"><div className="flex items-center justify-between gap-4"><h4 className="font-black text-slate-900">{row.faction_name}</h4><p className="font-black text-slate-950">{row.vote_count.toLocaleString("ja-JP")}票 <span className="ml-2 text-sm text-slate-500">{percentage.toFixed(1)}%</span></p></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} /></div></article>;
    })}</div>
    {unassignedCount > 0 && <p className="mt-4 text-xs font-semibold text-slate-600">最終派閥未設定：{unassignedCount.toLocaleString("ja-JP")}人</p>}
    <p className="mt-3 text-xs leading-5 text-slate-500">終了時点のメイン派閥を1人1票として集計。複数派閥の追加所属は票に含みません。</p>
  </section>;
}

function SuperiorityFinalResultSection({ rows }: { rows: SuperiorityFinalResult[] }) {
  const totalPosts = rows.reduce((sum, row) => sum + row.post_count, 0);
  const leaders = totalPosts > 0 ? rows.filter((row) => row.result_rank === 1) : [];
  const resultLabel = totalPosts === 0 ? "結果：判定なし" : leaders.length === 1 ? `最優勢：${leaders[0].faction_name}` : "結果：同率首位";

  return <section className="mt-6 rounded-xl border border-blue-100 bg-blue-50/50 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold tracking-wider text-blue-700">OFFICIAL RESULT</p><h3 className="mt-1 text-lg font-black text-slate-950">優劣結果</h3></div><p className="rounded-full bg-white px-4 py-2 text-sm font-black text-blue-800 shadow-sm">{resultLabel}</p></div>
    {leaders.length > 1 && <p className="mt-3 text-sm font-bold text-slate-700">同率1位：{leaders.map((row) => row.faction_name).join("、")}</p>}
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.map((row) => <article key={row.faction_id || row.faction_name} className="flex items-center gap-3 rounded-lg border border-blue-100 bg-white px-4 py-3"><p className="text-sm font-black text-blue-700">{row.result_rank}位</p><h4 className="min-w-0 flex-1 truncate font-black text-slate-900">{row.faction_name}</h4><p className="shrink-0 text-lg font-black text-slate-950">{row.points.toLocaleString("ja-JP")}<span className="ml-1 text-xs text-slate-500">pt</span></p></article>)}</div>
    <p className="mt-4 text-xs leading-5 text-slate-500">各派閥として発言された内容が得たリアクションポイントの合計です（納得 +2、不服 0、懐疑 -1、微妙 0）。ポイントは討論終了時点で確定します。</p>
  </section>;
}

export default async function RecordDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const topic = await getRecordTopic(slug);
  if (!topic) notFound();
  const data = await getRecordData(topic.id, topic.debate_type);
  if (!isTopicEnded(topic.status, topic.ends_at, new Date(), data.rules.end_mode === "inactivity" ? { timeoutMinutes: data.rules.inactivity_timeout_minutes, lastPostAt: topic.last_post_at, createdAt: topic.created_at } : undefined)) notFound();
  const revealResult = data.rules.name_mode === "werewolf" && data.rules.werewolf_reveal_mode === "after_end"
    ? await getRevealPairs(topic.id)
    : { pairs: [], failed: false };
  const categoryStyle = getTopicCategoryPresentation(topic.category);
  const factionNames = new Map(data.factions.map((faction) => [String(faction.id), faction.name]));
  const postTree = buildPostTree(data.posts, factionNames, createReactionCountMap(data.counts), createMyReactionMap(data.myReactions), !data.countsFailed);
  const postNumbers = new Map(postTree.map((post, index) => [post.id, postTree.length - index]));
  const mainPostNavigationItems = postTree.map((post) => ({
    anchorId: `record-main-post-${post.id}`,
    postId: post.id,
    number: postNumbers.get(post.id) ?? 1,
  }));
  const timeline = [
    ...postTree.map((post) => ({ kind: "post" as const, occurredAt: post.createdAt, post })),
    ...data.events.map((event) => ({ kind: "event" as const, occurredAt: event.moved_at, event })),
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const yesNo = (value: boolean) => value ? "許可" : "不許可";

  return <main><section className="border-b border-slate-200 bg-white"><div className="page-shell py-8 sm:py-12"><Link href="/records" className="text-xs font-bold text-slate-500 hover:text-blue-700">← 記録一覧に戻る</Link><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">● 討論終了</span><span className="px-2 py-1 text-xs font-bold text-blue-700">{getDebateTypeLabel(topic.debate_type)}</span><CategoryBadge category={topic.category} /></div><h1 className="mt-4 max-w-4xl text-2xl font-black text-slate-950 sm:text-4xl">{topic.title}</h1><p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">{topic.summary ?? "概要は登録されていません。"}</p><dl className="mt-6 grid max-w-4xl gap-4 border-y border-slate-100 py-5 text-sm sm:grid-cols-2"><div><dt className="font-black text-slate-800">本文</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{topic.content ?? "内容は登録されていません。"}</dd></div><div><dt className="font-black text-slate-800">目的</dt><dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-600">{topic.purpose ?? "目的は登録されていません。"}</dd></div></dl><div className="mt-5 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold text-slate-500">派閥</span>{data.factionsFailed ? <span className="text-xs text-slate-500">派閥を取得できませんでした</span> : data.factions.map((faction) => <FactionBadge key={faction.id} name={faction.name} />)}</div><p className="mt-4 text-xs font-semibold text-slate-500">{topic.ends_at ? `終了：${formatTopicEndDate(topic.ends_at)}` : "終了済み"}</p></div></section>

    <div className="page-shell py-10 sm:py-14"><section className="panel p-5 sm:p-7"><p className="section-kicker">DISCUSSION RULES</p><h2 className="text-xl font-black text-slate-900">討論ルール</h2><dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><RuleValue label="記名方式" value={nameModeLabels[data.rules.name_mode]} /><RuleValue label="発言回数" value={data.rules.max_posts_per_member === null ? "無制限" : `1人${data.rules.max_posts_per_member}回まで`} /><RuleValue label="派閥所属" value={data.rules.require_faction ? "必須" : "任意"} /><RuleValue label="派閥移動" value={yesNo(data.rules.allow_faction_change)} /><RuleValue label="複数派閥" value={yesNo(data.rules.allow_multiple_factions)} /><RuleValue label="派閥追加" value={yesNo(data.rules.allow_faction_addition)} /><RuleValue label="虚偽発言" value={yesNo(data.rules.allow_deception)} /><RuleValue label="必要評価ポイント" value={data.rules.min_evaluation_points === null ? "制限なし" : `${data.rules.min_evaluation_points}pt`} />{data.rules.name_mode === "werewolf" && <RuleValue label="正体公開" value={data.rules.werewolf_reveal_mode === "after_end" ? "討論終了時に公開" : "永久に非公開"} />}</dl></section>

      <section className="panel mt-8 p-5 sm:p-7">
        <p className="section-kicker">DISCUSSION RESULT</p>
        <h2 className="text-xl font-black text-slate-900">{topic.debate_type === "binary" || topic.debate_type === "superiority" ? "最終結果" : "討論サマリー"}</h2>
        {data.summaryFailed && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">討論結果の一部を取得できませんでした</p>}
        {data.finalResultFailed && (topic.debate_type === "binary" || topic.debate_type === "superiority") && <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">公式最終結果を取得できませんでした</p>}
        {!data.finalResultFailed && topic.debate_type === "binary" && <BinaryFinalResultSection rows={data.binaryFinalResult} />}
        {!data.finalResultFailed && topic.debate_type === "superiority" && <SuperiorityFinalResultSection rows={data.superiorityFinalResult} />}
        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <ResultMetric label="参加者" value={data.recordSummary.participant_count} suffix="人" />
          <ResultMetric label="総発言" value={data.recordSummary.total_posts} suffix="件" />
          <ResultMetric label="本筋" value={data.recordSummary.main_posts} suffix="件" />
          <ResultMetric label="返信" value={data.recordSummary.reply_posts} suffix="件" />
          <ResultMetric label="派閥移動" value={data.recordSummary.faction_change_count} suffix="回" />
        </dl>
        <div className="mt-5">
          <h3 className="text-sm font-black text-slate-900">リアクション</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResultMetric label="納得" value={data.recordSummary.reaction_agree_count} suffix="" />
            <ResultMetric label="不服" value={data.recordSummary.reaction_dissatisfied_count} suffix="" />
            {!data.rules.allow_deception && <ResultMetric label="懐疑" value={data.recordSummary.reaction_skeptical_count} suffix="" />}
            <ResultMetric label="微妙" value={data.recordSummary.reaction_uncertain_count} suffix="" />
          </dl>
        </div>
        <div className="mt-5">
          <h3 className="text-sm font-black text-slate-900">派閥別</h3>
          {data.factionSummary.length === 0 ? <p className="mt-2 text-sm text-slate-500">派閥別の集計はありません</p> : <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">{data.factionSummary.map((faction) => <article key={faction.faction_id || faction.faction_name} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5"><h4 className="truncate text-sm font-black text-slate-900">{faction.faction_name}</h4><p className="mt-1 text-xs font-semibold text-slate-500">{data.rules.name_mode !== "werewolf" && <>{faction.primary_member_count.toLocaleString("ja-JP")}人 / </>}{faction.post_count.toLocaleString("ja-JP")}発言</p></article>)}</div>}
        </div>
      </section>

      {data.rules.name_mode === "werewolf" && data.rules.werewolf_reveal_mode === "after_end" && <section className="panel mt-8 p-5 sm:p-7"><p className="section-kicker">WEREWOLF REVEAL</p><h2 className="text-xl font-black text-slate-900">人狼 正体公開</h2>{revealResult.failed ? <p className="mt-4 text-sm font-semibold text-amber-700">正体公開情報を取得できませんでした</p> : <div className="mt-5 grid gap-4 sm:grid-cols-2">{revealResult.pairs.map((pair, index) => <article key={`${pair.alias_1}-${pair.alias_2}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="rounded-lg bg-white px-3 py-2 text-sm"><b>{pair.alias_1}</b> <span className="text-xs text-slate-500">［{pair.faction_1_name}］</span></p><p className="py-2 text-center text-xs font-bold text-slate-400">⇅ 同一参加者</p><p className="rounded-lg bg-white px-3 py-2 text-sm"><b>{pair.alias_2}</b> <span className="text-xs text-slate-500">［{pair.faction_2_name}］</span></p></article>)}</div>}</section>}

      <section className="mt-10"><div className="mb-6 flex items-end justify-between"><div><p className="section-kicker">ARCHIVED THREAD</p><h2 className="section-title">本筋のタイムライン</h2></div><span className="text-xs text-slate-400">新しい順・読み取り専用</span></div>{data.countsFailed && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">評価数を取得できませんでした</p>}{data.eventsFailed && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">派閥移動イベントを取得できませんでした</p>}{data.postsFailed ? <div className="panel px-6 py-12 text-center text-sm font-bold text-slate-600">発言を取得できませんでした</div> : timeline.length === 0 ? <div className="panel px-6 py-12 text-center text-sm font-bold text-slate-600">発言はありません</div> : <div className={`grid gap-5 ${mainPostNavigationItems.length >= 2 ? "lg:grid-cols-[minmax(0,1fr)_44px]" : "lg:grid-cols-1"}`}><div id="record-main-post-timeline" className="space-y-8">{timeline.map((item, index) => item.kind === "post" ? <div key={`post-${item.post.id}`} id={`record-main-post-${item.post.id}`} data-main-post-anchor className="scroll-mt-32 sm:scroll-mt-24"><PostCard post={item.post} topicSlug={slug} postingFactions={[]} primaryFactionId="" allowFactionSelection={false} allowSkepticalReaction={!data.rules.allow_deception} canReply={false} allowReplies={false} canReact={data.canReact} index={postNumbers.get(item.post.id)} stickyMain mainAnchorId={`record-main-post-${item.post.id}`} /></div> : <FactionChangeEventCard key={`event-${item.event.moved_at}-${index}`} event={item.event} />)}</div>{mainPostNavigationItems.length >= 2 && <aside className="hidden lg:block" aria-label="本筋位置ナビゲーション"><MainPostNavigator items={mainPostNavigationItems} timelineId="record-main-post-timeline" /></aside>}</div>}</section>
    </div></main>;
}
