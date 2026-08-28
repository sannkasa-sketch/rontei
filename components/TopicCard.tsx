import Link from "next/link";
import { FactionBadge } from "./FactionBadge";
import { TopicRemainingTime } from "./TopicRemainingTime";
import { CategoryBadge } from "./CategoryBadge";
import { getTopicCategoryPresentation, normalizeTopicCategory } from "@/lib/topic-category";

export type TopicCardData = {
  id: string;
  slug?: string;
  title: string;
  summary: string;
  type: string;
  category?: unknown;
  status: string;
  factions?: string[];
  participants?: number;
  posts?: number;
  postsLast24h?: number;
  endsAt?: string | null;
  isEnded?: boolean;
  referenceNow: string;
  options?: string[];
};

export function TopicCard({ topic, compact = false }: { topic: TopicCardData; compact?: boolean }) {
  const hasStats = topic.participants !== undefined || topic.posts !== undefined || topic.postsLast24h !== undefined;
  const category = normalizeTopicCategory(topic.category);
  const categoryStyle = getTopicCategoryPresentation(category);

  return (
    <Link data-topic-category={category} href={`/topics/${topic.slug ?? topic.id}`} className={`panel group flex h-full flex-col px-5 py-4 shadow-sm hover:shadow-md sm:px-5 sm:py-4 ${categoryStyle.panelClass} ${categoryStyle.borderClass} ${categoryStyle.hoverBorderClass}`}>
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-sm font-black text-blue-800">{topic.type}</span><CategoryBadge category={topic.category} /></div>
        <TopicRemainingTime endsAt={topic.endsAt} isEnded={topic.isEnded} referenceNow={topic.referenceNow} variant="pill" />
      </div>
      <h3 className="[overflow-wrap:anywhere] text-lg font-black leading-6 text-slate-900 group-hover:text-blue-800">{topic.title}</h3>
      <p className="mt-2 line-clamp-2 [overflow-wrap:anywhere] text-sm leading-6 text-slate-600">{topic.summary}</p>

      {topic.factions && topic.factions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">{topic.factions.map((faction) => <FactionBadge key={faction} name={faction} />)}</div>
      )}

      {topic.options && topic.options.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600" aria-label="有効な討論オプション">
          {topic.options.map((option) => <span key={option} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />{option}</span>)}
        </div>
      )}

      {hasStats && (
        <div className={`mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t pt-3 text-xs text-slate-500 ${categoryStyle.borderClass} ${compact ? "!mt-4" : "!mt-5"}`}>
          {topic.participants !== undefined && <span><b className="text-slate-800">{topic.participants}</b> 人が参加</span>}
          {topic.posts !== undefined && <span><b className="text-slate-800">{topic.posts}</b> 発言</span>}
          {topic.postsLast24h !== undefined && <span data-testid="topic-recent-posts"><b className="text-slate-800">24h {topic.postsLast24h}</b> 発言</span>}
        </div>
      )}
    </Link>
  );
}
