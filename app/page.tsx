import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge } from "@/components/CategoryBadge";
import { TopicCard, type TopicCardData } from "@/components/TopicCard";
import { createClient } from "@/lib/supabase/server";
import { getTopicCategoryPresentation } from "@/lib/topic-category";
import { formatTopicEndDate, getDebateTypeLabel, getTopicStatusLabel, isTopicEnded } from "@/lib/topic-display";
import { createTopicPublicStatsMap, emptyTopicPublicStats } from "@/lib/topic-public-stats";
import { createTopicRecentActivityMap, emptyTopicRecentActivity } from "@/lib/topic-recent-activity";

export const metadata: Metadata = { title: { absolute: "論庭" }, description: "違いが芽吹く、対話の庭。" };
export const dynamic = "force-dynamic";

type HomeTopic = { id: string; slug: string; title: string; summary: string | null; debate_type: string; category: string | null; status: string; ends_at: string | null; created_at: string };
type HomeData = { active: TopicCardData[]; endingSoon: TopicCardData[]; records: Array<HomeTopic & { participants: number; posts: number }>; activeFailed: boolean; recordsFailed: boolean };

function toTopicCard(topic: HomeTopic, statsById: ReturnType<typeof createTopicPublicStatsMap>, recentById: ReturnType<typeof createTopicRecentActivityMap>, referenceNow: string): TopicCardData {
  const stats = statsById.get(topic.id) ?? emptyTopicPublicStats;
  const recent = recentById.get(topic.id) ?? emptyTopicRecentActivity;
  return { id: topic.id, slug: topic.slug, title: topic.title, summary: topic.summary ?? "概要はまだ登録されていません。", type: getDebateTypeLabel(topic.debate_type), status: getTopicStatusLabel(topic.status), category: topic.category, participants: stats.participant_count, posts: stats.total_posts, postsLast24h: recent.posts_last_24h, endsAt: topic.ends_at, isEnded: false, referenceNow };
}

async function loadHomeData(): Promise<HomeData> {
  const db = await createClient();
  const referenceNow = new Date().toISOString();
  const referenceDate = new Date(referenceNow);
  const [activeResult, recordsResult] = await Promise.all([
    db.from("topics").select("id, slug, title, summary, debate_type, category, status, ends_at, created_at").eq("status", "active").or(`ends_at.is.null,ends_at.gt.${referenceNow}`).not("title", "like", "[E2E]%").order("created_at", { ascending: false }).limit(60),
    db.from("topics").select("id, slug, title, summary, debate_type, category, status, ends_at, created_at").or(`status.neq.active,ends_at.lte.${referenceNow}`).order("ends_at", { ascending: false, nullsFirst: false }).limit(4),
  ]);
  const activeTopics = activeResult.error ? [] : ((activeResult.data ?? []) as HomeTopic[]).filter((topic) => !topic.title.startsWith("[E2E]") && !isTopicEnded(topic.status, topic.ends_at, referenceDate));
  const recordTopics = recordsResult.error ? [] : (recordsResult.data ?? []) as HomeTopic[];
  const allIds = [...new Set([...activeTopics, ...recordTopics].map((topic) => topic.id))];
  const activeIds = activeTopics.map((topic) => topic.id);
  const [statsResult, recentResult] = await Promise.all([
    allIds.length ? db.rpc("get_topics_public_stats", { p_topic_ids: allIds }) : Promise.resolve({ data: [], error: null }),
    activeIds.length ? db.rpc("get_topics_recent_activity", { p_topic_ids: activeIds }) : Promise.resolve({ data: [], error: null }),
  ]);
  const statsById = statsResult.error ? new Map() : createTopicPublicStatsMap(statsResult.data);
  const recentById = recentResult.error ? new Map() : createTopicRecentActivityMap(recentResult.data);
  const active = [...activeTopics].sort((a, b) => (recentById.get(b.id)?.posts_last_24h ?? 0) - (recentById.get(a.id)?.posts_last_24h ?? 0) || Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 6).map((topic) => toTopicCard(topic, statsById, recentById, referenceNow));
  const endingSoon = activeTopics.filter((topic) => topic.status === "active" && topic.ends_at !== null && Date.parse(topic.ends_at) > referenceDate.getTime() && !isTopicEnded(topic.status, topic.ends_at, referenceDate)).sort((a, b) => Date.parse(a.ends_at!) - Date.parse(b.ends_at!)).slice(0, 4).map((topic) => toTopicCard(topic, statsById, recentById, referenceNow));
  const records = recordTopics.map((topic) => { const stats = statsById.get(topic.id) ?? emptyTopicPublicStats; return { ...topic, participants: stats.participant_count, posts: stats.total_posts }; });
  return { active, endingSoon, records, activeFailed: Boolean(activeResult.error), recordsFailed: Boolean(recordsResult.error) };
}

function SectionHeading({ eyebrow, title, href, linkLabel }: { eyebrow: string; title: string; href: string; linkLabel: string }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="section-kicker">{eyebrow}</p><h2 className="section-title">{title}</h2></div><Link href={href} className="text-sm font-bold text-blue-700 hover:text-blue-900">{linkLabel} →</Link></div>;
}

function RecordCard({ topic }: { topic: HomeData["records"][number] }) {
  const style = getTopicCategoryPresentation(topic.category);
  return <Link data-testid="home-record-card" href={`/records/${encodeURIComponent(topic.slug)}`} className={`panel group flex h-full flex-col px-5 py-4 shadow-sm hover:shadow-md ${style.panelClass} ${style.borderClass} ${style.hoverBorderClass}`}><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-blue-800">{getDebateTypeLabel(topic.debate_type)}</span><CategoryBadge category={topic.category} /></div><h3 className="mt-2 text-base font-black leading-6 text-slate-900 group-hover:text-blue-800">{topic.title}</h3><p className="mt-2 text-xs font-semibold text-slate-500">{topic.ends_at ? formatTopicEndDate(topic.ends_at) : "終了済み"}</p><div className={`mt-auto flex flex-wrap gap-x-4 border-t pt-3 text-xs text-slate-500 ${style.borderClass} !mt-4`}><span><b className="text-slate-800">{topic.participants}</b>人参加</span><span><b className="text-slate-800">{topic.posts}</b>発言</span><span className="ml-auto font-bold text-blue-700">記録を見る →</span></div></Link>;
}

export default async function Home() {
  const db = await createClient();
  const [{ data: authData }, home] = await Promise.all([db.auth.getClaims(), loadHomeData()]);
  const loggedIn = Boolean(authData?.claims?.sub);
  return <main>
    <section className="border-b border-slate-200 bg-white"><div className="page-shell py-12 sm:py-16 lg:py-20"><div className="max-w-3xl border-l-4 border-blue-600 pl-5 sm:pl-7"><p className="section-kicker">WHERE DIALOGUE GROWS</p><h1 data-testid="home-hero" className="mt-2 text-5xl font-black tracking-[-0.05em] text-slate-950 sm:text-7xl">論庭</h1><p className="mt-4 text-xl font-black leading-8 text-slate-800 sm:text-2xl">違いが芽吹く、対話の庭。</p><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">本筋から賛同・反論・補足・質問へ。議論の流れを見失わず、考えを整理しながら対話できます。</p></div><div className="mt-7 flex flex-wrap gap-3"><Link href="/topics" className="button-primary">議題を探す →</Link><Link href="/topics/new" className="button-secondary">議題を作る</Link>{loggedIn && <Link href="/mypage" className="button-secondary">マイページ</Link>}</div></div></section>
    <section data-testid="home-active-topics" className="page-shell py-12 sm:py-16"><SectionHeading eyebrow="ACTIVE TOPICS" title="いま議論されている議題" href="/topics" linkLabel="すべて見る" />{home.activeFailed ? <div className="panel px-6 py-9 text-center text-sm font-semibold text-slate-500">議題の一部を取得できませんでした。</div> : home.active.length === 0 ? <div className="panel px-6 py-9 text-center text-sm font-semibold text-slate-500">現在、参加できる議題はありません。</div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{home.active.map((topic) => <div data-testid="home-topic-card" key={topic.id}><TopicCard topic={topic} compact /></div>)}</div>}</section>
    {home.endingSoon.length > 0 && <section data-testid="home-ending-soon" className="border-y border-slate-200 bg-slate-50/70"><div className="page-shell py-10 sm:py-12"><SectionHeading eyebrow="ENDING SOON" title="終了が近い議題" href="/topics" linkLabel="すべて見る" /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{home.endingSoon.map((topic) => <TopicCard key={topic.id} topic={topic} compact />)}</div></div></section>}
    <section data-testid="home-recent-records" className="page-shell py-12 sm:py-16"><SectionHeading eyebrow="RECENT RECORDS" title="最近終了した議事録" href="/records" linkLabel="すべて見る" />{home.recordsFailed ? <div className="panel px-6 py-9 text-center text-sm font-semibold text-slate-500">議事録の一部を取得できませんでした。</div> : home.records.length === 0 ? <p className="text-sm font-semibold text-slate-500">まだ終了した議事録はありません。</p> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{home.records.map((topic) => <RecordCard key={topic.id} topic={topic} />)}</div>}</section>
    <section className="border-t border-slate-200 bg-slate-50"><div className="page-shell py-12 sm:py-16"><p className="section-kicker">ABOUT</p><h2 className="section-title">論庭とは</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">論庭は、ひとつの議題から生まれた意見を、本筋から賛同・反論・補足・質問へ枝分かれさせながら、対話を育てていくサービスです。どの意見に対する発言なのかを整理して読むことができます。</p><div className="mt-7 grid gap-3 md:grid-cols-3"><div className="panel p-5"><b className="text-sm text-slate-900">議論を枝で読む</b><p className="mt-2 text-xs leading-6 text-slate-500">本筋から返信関係を視覚的に追えます。</p></div><div className="panel p-5"><b className="text-sm text-slate-900">立場を示して話す</b><p className="mt-2 text-xs leading-6 text-slate-500">議題ごとの派閥・発言名で参加できます。</p></div><div className="panel p-5"><b className="text-sm text-slate-900">終了後も記録に残る</b><p className="mt-2 text-xs leading-6 text-slate-500">討論は読み返しやすい議事録になります。</p></div></div></div></section>
  </main>;
}
