import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge } from "@/components/CategoryBadge";
import { FactionBadge } from "@/components/FactionBadge";
import { PageIntro } from "@/components/PageIntro";
import { createClient } from "@/lib/supabase/server";
import { getTopicCategoryPresentation, getTopicCategoryStyle, topicCategoryOptions } from "@/lib/topic-category";
import { formatTopicEndDate, getDebateTypeLabel } from "@/lib/topic-display";
import { clampPage, parsePositivePage, parseTopicCategoryFilter, topicsPageSize, type TopicCategoryFilter } from "@/lib/topics-list";
import { createTopicPublicStatsMap, emptyTopicPublicStats } from "@/lib/topic-public-stats";

export const metadata: Metadata = { title: "議事録・記録" };
export const dynamic = "force-dynamic";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type Topic = { id: string; slug: string; title: string; summary: string | null; debate_type: string; category: string | null; status: string; ends_at: string | null; effective_ends_at: string | null };
type Card = Topic & { factions: string[]; participants: number; posts: number; result: string | null };

function href(page: number, category: TopicCategoryFilter) { const p = new URLSearchParams(); if (category !== "all") p.set("category", category); p.set("page", String(page)); return `/records?${p}`; }
function resultLabel(type: string, data: unknown) {
  const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
  if (type === "binary") { const total = Number(rows[0]?.total_votes ?? 0); if (!total) return "判定なし"; const leaders = rows.filter((r) => Number(r.result_rank) === 1); return leaders.length === 1 ? `勝者：${String(leaders[0].faction_name)}` : "引き分け"; }
  if (type === "superiority") { const first = rows.sort((a, b) => Number(a.result_rank) - Number(b.result_rank))[0]; return first ? `1位 ${String(first.faction_name)}` : "判定なし"; }
  return null;
}

async function load(requestedPage: number, category: TopicCategoryFilter) {
  const db = await createClient();
  let cq = db.from("public_topics_with_end_state").select("id", { count: "exact", head: true }).eq("effectively_ended", true); if (category !== "all") cq = cq.eq("category", category);
  const counted = await cq; if (counted.error) return { topics: [] as Card[], failed: true, page: 1, totalPages: 0, totalItems: 0 };
  const totalItems = counted.count ?? 0; const page = clampPage(requestedPage, totalItems); const totalPages = Math.ceil(totalItems / topicsPageSize); const from = (page - 1) * topicsPageSize;
  let tq = db.from("public_topics_with_end_state").select("id, slug, title, summary, debate_type, category, status, ends_at, effective_ends_at").eq("effectively_ended", true); if (category !== "all") tq = tq.eq("category", category);
  const got = await tq.order("effective_ends_at", { ascending: false, nullsFirst: false }).range(from, from + topicsPageSize - 1); if (got.error) return { topics: [] as Card[], failed: true, page, totalPages, totalItems };
  const topics = (got.data ?? []) as Topic[]; const ids = topics.map((t) => t.id);
  const [fr, sr, ...results] = ids.length ? await Promise.all([db.from("factions").select("topic_id, name, sort_order").in("topic_id", ids).order("sort_order"), db.rpc("get_topics_public_stats", { p_topic_ids: ids }), ...topics.map((t) => t.debate_type === "binary" ? db.rpc("get_binary_final_result", { p_topic_id: t.id }) : t.debate_type === "superiority" ? db.rpc("get_superiority_final_result", { p_topic_id: t.id }) : Promise.resolve({ data: [], error: null }))]) : [{ data: [], error: null }, { data: [], error: null }];
  if (fr.error || sr.error) return { topics: [] as Card[], failed: true, page, totalPages, totalItems };
  const fm = new Map<string, string[]>(); for (const r of fr.data ?? []) fm.set(String(r.topic_id), [...(fm.get(String(r.topic_id)) ?? []), String(r.name)]); const sm = createTopicPublicStatsMap(sr.data);
  return { topics: topics.map((t, i) => { const s = sm.get(t.id) ?? emptyTopicPublicStats; return { ...t, factions: fm.get(t.id) ?? [], participants: s.participant_count, posts: s.total_posts, result: results[i]?.error ? null : resultLabel(t.debate_type, results[i]?.data) }; }), failed: false, page, totalPages, totalItems };
}

export default async function RecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await searchParams; const category = parseTopicCategoryFilter(p.category); const data = await load(parsePositivePage(p.page), category);
  return <main><PageIntro eyebrow="DISCUSSION ARCHIVE" title="議事録・記録" description="終了した討論の論点、発言ツリー、最終結果を読み返せます。" /><div className="mx-auto w-full max-w-[1680px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
    <nav className="mb-7 flex gap-2 overflow-x-auto pb-2" aria-label="内容カテゴリ"><Link href={href(1, "all")} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${category === "all" ? "border-slate-500 bg-slate-100 ring-2 ring-slate-200" : "border-slate-200 bg-white text-slate-600"}`}>すべて</Link>{topicCategoryOptions.map((o) => <Link key={o.value} href={href(1, o.value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${getTopicCategoryStyle(o.value)} ${category === o.value ? "ring-2 ring-current ring-offset-1" : "opacity-80"}`}>{o.label}</Link>)}</nav>
    {!data.failed && data.totalItems > 0 && <p className="mb-5 text-xs font-semibold text-slate-500">{data.totalItems}件中 {(data.page - 1) * topicsPageSize + 1}〜{Math.min(data.page * topicsPageSize, data.totalItems)}件を表示</p>}
    {data.failed ? <div className="rounded-xl border border-slate-200 bg-white px-5 py-7 text-center text-sm font-semibold">議事録を取得できませんでした。</div> : !data.topics.length ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center text-sm font-semibold text-slate-600">まだ議事録はありません。</div> : <div className="topics-card-grid">{data.topics.map((t) => { const s = getTopicCategoryPresentation(t.category); return <Link key={t.id} href={`/records/${encodeURIComponent(t.slug)}`} className={`panel group flex h-full flex-col px-5 py-4 shadow-sm hover:shadow-md ${s.panelClass} ${s.borderClass} ${s.hoverBorderClass}`}><div className="mb-2.5 flex items-start justify-between gap-2"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-blue-800">{getDebateTypeLabel(t.debate_type)}</span><CategoryBadge category={t.category} /></div><div className="shrink-0 text-right"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">終了</span>{t.ends_at && <p className="mt-1.5 text-[10px] font-semibold text-slate-500">{formatTopicEndDate(t.ends_at)}</p>}</div></div><h2 className="text-lg font-black leading-6 text-slate-900 group-hover:text-blue-800">{t.title}</h2><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{t.summary ?? "概要はまだ登録されていません。"}</p>{t.factions.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{t.factions.map((f) => <FactionBadge key={f} name={f} />)}</div>}{t.result && <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs font-black">{t.result}</p>}<div className={`mt-auto flex flex-wrap gap-x-4 border-t pt-3 text-xs text-slate-500 ${s.borderClass} !mt-4`}><span><b className="text-slate-800">{t.participants}</b> 人が参加</span><span><b className="text-slate-800">{t.posts}</b> 発言</span><span className="ml-auto font-bold text-blue-700">記録を見る →</span></div></Link>; })}</div>}
    {!data.failed && data.totalPages > 1 && <nav className="mt-10 flex justify-center gap-3">{data.page > 1 ? <Link href={href(data.page - 1, category)} className="button-secondary">前へ</Link> : <span className="button-secondary opacity-40">前へ</span>}<span className="py-2 text-sm font-black">{data.page} / {data.totalPages}</span>{data.page < data.totalPages ? <Link href={href(data.page + 1, category)} className="button-secondary">次へ</Link> : <span className="button-secondary opacity-40">次へ</span>}</nav>}
  </div></main>;
}
