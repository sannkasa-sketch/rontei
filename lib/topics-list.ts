import { normalizeTopicCategory, type TopicCategory } from "@/lib/topic-category";

export const topicsPageSize = 30;
export const topicSorts = ["all", "new", "popular", "ending"] as const;
export type TopicSort = (typeof topicSorts)[number];
export type TopicCategoryFilter = TopicCategory | "all";

export function parsePositivePage(value: unknown): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = typeof raw === "string" ? Number.parseInt(raw, 10) : 1;
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export function clampPage(page: number, totalItems: number): number {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, totalItems) / topicsPageSize));
  return Math.min(Math.max(1, page), totalPages);
}

export function parseTopicCategoryFilter(value: unknown): TopicCategoryFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "all" || raw === undefined) return "all";
  const normalized = normalizeTopicCategory(raw);
  return normalized === raw ? normalized : "all";
}

export function parseTopicSort(value: unknown): TopicSort {
  const raw = Array.isArray(value) ? value[0] : value;
  return topicSorts.includes(raw as TopicSort) ? raw as TopicSort : "all";
}

export function buildTopicsHref(page: number, category: TopicCategoryFilter, sort: TopicSort): string {
  const params = new URLSearchParams();
  if (sort !== "all") params.set("sort", sort);
  if (category !== "all") params.set("category", category);
  params.set("page", String(Math.max(1, page)));
  return `/topics?${params.toString()}`;
}
