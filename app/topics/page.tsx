import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/PageIntro";
import { TopicCard, type TopicCardData } from "@/components/TopicCard";
import { createClient } from "@/lib/supabase/server";
import { getTopicCategoryStyle, topicCategoryOptions } from "@/lib/topic-category";
import { createTopicPublicStatsMap, emptyTopicPublicStats } from "@/lib/topic-public-stats";
import { createTopicRecentActivityMap, emptyTopicRecentActivity } from "@/lib/topic-recent-activity";
import { getDebateTypeLabel, getTopicStatusLabel } from "@/lib/topic-display";
import { buildTopicsHref, clampPage, parsePositivePage, parseTopicCategoryFilter, parseTopicSort, topicsPageSize, type TopicCategoryFilter, type TopicSort } from "@/lib/topics-list";

export const metadata: Metadata = { title: "議題一覧" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type DatabaseTopic = { id: string | number; slug: string; title: string; summary: string | null; debate_type: string; category: string | null; status: string; created_at: string; ends_at: string | null; effective_ends_at: string | null };
type TopicRule = { topic_id: string | number; name_mode: string; allow_faction_change: boolean; allow_multiple_factions: boolean; allow_faction_addition: boolean; allow_deception: boolean; max_posts_per_member: number | null; min_evaluation_points: number | null };
type TopicsResult = { topics: TopicCardData[]; failed: boolean; page: number; totalPages: number; totalItems: number };

async function getTopics(requestedPage: number, category: TopicCategoryFilter, sort: TopicSort): Promise<TopicsResult> {
  try {
    const supabase = await createClient();
    const referenceNow = new Date().toISOString();
    let countQuery = supabase.from("public_topics_with_end_state").select("id", { count: "exact", head: true }).eq("effectively_ended", false);
    if (category !== "all") countQuery = countQuery.eq("category", category);
    const { count, error: countError } = await countQuery;
    if (countError) return { topics: [], failed: true, page: 1, totalPages: 0, totalItems: 0 };

    const totalItems = count ?? 0;
    const totalPages = Math.ceil(totalItems / topicsPageSize);
    const page = clampPage(requestedPage, totalItems);
    const from = (page - 1) * topicsPageSize;
    let topicsQuery = supabase.from("public_topics_with_end_state").select("id, slug, title, summary, debate_type, category, status, created_at, ends_at, effective_ends_at").eq("effectively_ended", false);
    if (category !== "all") topicsQuery = topicsQuery.eq("category", category);
    topicsQuery = sort === "ending"
      ? topicsQuery.order("effective_ends_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
      : topicsQuery.order("created_at", { ascending: false });
    const { data, error } = await topicsQuery.range(from, from + topicsPageSize - 1);
    if (error) return { topics: [], failed: true, page, totalPages, totalItems };

    const pageTopics = (data ?? []) as DatabaseTopic[];
    const topicIds = pageTopics.map((topic) => String(topic.id));
    const [statsResult, recentActivityResult, factionsResult, rulesResult] = topicIds.length > 0 ? await Promise.all([
      supabase.rpc("get_topics_public_stats", { p_topic_ids: topicIds }),
      supabase.rpc("get_topics_recent_activity", { p_topic_ids: topicIds }),
      supabase.from("factions").select("topic_id, name, sort_order").in("topic_id", topicIds).order("sort_order", { ascending: true }),
      supabase.from("topic_rules").select("topic_id, name_mode, allow_faction_change, allow_multiple_factions, allow_faction_addition, allow_deception, max_posts_per_member, min_evaluation_points").in("topic_id", topicIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    if (statsResult.error || recentActivityResult.error || factionsResult.error || rulesResult.error) return { topics: [], failed: true, page, totalPages, totalItems };

    const statsByTopicId = createTopicPublicStatsMap(statsResult.data);
    const recentActivityByTopicId = createTopicRecentActivityMap(recentActivityResult.data);
    const factionsByTopicId = new Map<string, string[]>();
    for (const faction of factionsResult.data ?? []) {
      const topicId = String(faction.topic_id);
      factionsByTopicId.set(topicId, [...(factionsByTopicId.get(topicId) ?? []), String(faction.name)]);
    }
    const rulesByTopicId = new Map<string, TopicRule>(((rulesResult.data ?? []) as TopicRule[]).map((rule) => [String(rule.topic_id), rule]));
    const topics = pageTopics.map((topic) => {
      const stats = statsByTopicId.get(String(topic.id)) ?? emptyTopicPublicStats;
      const recentActivity = recentActivityByTopicId.get(String(topic.id)) ?? emptyTopicRecentActivity;
      const rules = rulesByTopicId.get(String(topic.id));
      const options = rules ? [
        rules.allow_faction_change ? "移動" : null,
        rules.allow_multiple_factions ? "複数" : null,
        rules.allow_faction_addition ? "追加" : null,
        rules.allow_deception ? "虚偽" : null,
        rules.max_posts_per_member !== null ? `${rules.max_posts_per_member}回まで` : null,
        rules.min_evaluation_points !== null ? `${rules.min_evaluation_points}pt以上` : null,
        rules.name_mode === "werewolf" ? "人狼" : null,
      ].filter((option): option is string => option !== null) : [];
      return { id: String(topic.id), slug: topic.slug, title: topic.title, summary: topic.summary ?? "概要はまだ登録されていません。", type: getDebateTypeLabel(topic.debate_type), category: topic.category, status: getTopicStatusLabel(topic.status), endsAt: topic.effective_ends_at, isEnded: false, referenceNow, participants: stats.participant_count, posts: stats.total_posts, postsLast24h: recentActivity.posts_last_24h, factions: factionsByTopicId.get(String(topic.id)) ?? [], options };
    });
    return { topics, failed: false, page, totalPages, totalItems };
  } catch {
    return { topics: [], failed: true, page: 1, totalPages: 0, totalItems: 0 };
  }
}

const sortOptions: { value: TopicSort; label: string }[] = [{ value: "all", label: "すべて" }, { value: "new", label: "新着" }, { value: "popular", label: "人気" }, { value: "ending", label: "終了間近" }];

export default async function TopicsPage({ searchParams }: { searchParams: SearchParams }) {
  const query = await searchParams;
  const category = parseTopicCategoryFilter(query.category);
  const sort = parseTopicSort(query.sort);
  const { topics, failed, page, totalPages, totalItems } = await getTopics(parsePositivePage(query.page), category, sort);
  return <main>
    <PageIntro eyebrow="OPEN TOPICS" title="現在行われている議題" description="気になる論点を見つけて、それぞれの立場から議論に参加しましょう。" />
    <div className="mx-auto w-full max-w-[1680px] px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="議題の並び替え">{sortOptions.map((option) => <Link key={option.value} href={buildTopicsHref(1, category, option.value)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${sort === option.value ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400"}`}>{option.label}</Link>)}</div>
      <nav className="mb-7 flex gap-2 overflow-x-auto pb-2" aria-label="内容カテゴリ">
        <Link data-testid="category-filter-all" href={buildTopicsHref(1, "all", sort)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${category === "all" ? "border-slate-500 bg-slate-100 text-slate-900 ring-2 ring-slate-200" : "border-slate-200 bg-white text-slate-600"}`}>すべて</Link>
        {topicCategoryOptions.map((option) => <Link data-testid={`category-filter-${option.value}`} key={option.value} href={buildTopicsHref(1, option.value, sort)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${getTopicCategoryStyle(option.value)} ${category === option.value ? "ring-2 ring-current ring-offset-1" : "opacity-80 hover:opacity-100"}`}>{option.label}</Link>)}
      </nav>
      {!failed && totalItems > 0 && <p className="mb-5 text-xs font-semibold text-slate-500">{totalItems}件中 {(page - 1) * topicsPageSize + 1}〜{Math.min(page * topicsPageSize, totalItems)}件を表示</p>}
      {failed ? <div className="rounded-xl border border-slate-200 bg-white px-5 py-7 text-center text-sm font-semibold text-slate-600">議題を取得できませんでした。</div> : topics.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-7 text-center text-sm font-semibold text-slate-600">条件に合う議題はありません。</div> : <div data-testid="topics-grid" className="topics-card-grid">{topics.map((topic) => <TopicCard key={topic.id} topic={topic} />)}</div>}
      {!failed && totalPages > 1 && <nav className="mt-10 flex items-center justify-center gap-3" aria-label="ページネーション">
        {page > 1 ? <Link data-testid="pagination-previous" href={buildTopicsHref(page - 1, category, sort)} className="button-secondary px-4 py-2">前へ</Link> : <span className="rounded-lg border border-slate-100 px-4 py-2 text-sm font-bold text-slate-300">前へ</span>}
        <span data-testid="pagination-current" className="text-sm font-black text-slate-700">{page} / {totalPages}</span>
        {page < totalPages ? <Link data-testid="pagination-next" href={buildTopicsHref(page + 1, category, sort)} className="button-secondary px-4 py-2">次へ</Link> : <span className="rounded-lg border border-slate-100 px-4 py-2 text-sm font-bold text-slate-300">次へ</span>}
      </nav>}
    </div>
  </main>;
}
