export const topicCategories = [
  "politics", "society", "economy", "science", "technology", "philosophy",
  "culture", "entertainment", "games", "casual", "other",
] as const;

export type TopicCategory = (typeof topicCategories)[number];
export type TopicCategoryPresentation = {
  label: string;
  badgeClass: string;
  panelClass: string;
  borderClass: string;
  hoverBorderClass: string;
};

export const topicCategoryPresentation: Record<TopicCategory, TopicCategoryPresentation> = {
  politics: { label: "政治", badgeClass: "border-rose-200 bg-rose-100/70 text-rose-700", panelClass: "bg-rose-50/30", borderClass: "border-rose-200", hoverBorderClass: "hover:border-rose-300" },
  society: { label: "社会", badgeClass: "border-orange-200 bg-orange-100/70 text-orange-700", panelClass: "bg-orange-50/30", borderClass: "border-orange-200", hoverBorderClass: "hover:border-orange-300" },
  economy: { label: "経済", badgeClass: "border-amber-200 bg-amber-100/70 text-amber-700", panelClass: "bg-amber-50/30", borderClass: "border-amber-200", hoverBorderClass: "hover:border-amber-300" },
  science: { label: "科学", badgeClass: "border-cyan-200 bg-cyan-100/70 text-cyan-700", panelClass: "bg-cyan-50/30", borderClass: "border-cyan-200", hoverBorderClass: "hover:border-cyan-300" },
  technology: { label: "技術", badgeClass: "border-blue-200 bg-blue-100/70 text-blue-700", panelClass: "bg-blue-50/30", borderClass: "border-blue-200", hoverBorderClass: "hover:border-blue-300" },
  philosophy: { label: "哲学", badgeClass: "border-indigo-200 bg-indigo-100/70 text-indigo-700", panelClass: "bg-indigo-50/30", borderClass: "border-indigo-200", hoverBorderClass: "hover:border-indigo-300" },
  culture: { label: "文化", badgeClass: "border-pink-200 bg-pink-100/70 text-pink-700", panelClass: "bg-pink-50/30", borderClass: "border-pink-200", hoverBorderClass: "hover:border-pink-300" },
  entertainment: { label: "エンタメ", badgeClass: "border-purple-200 bg-purple-100/70 text-purple-700", panelClass: "bg-purple-50/30", borderClass: "border-purple-200", hoverBorderClass: "hover:border-purple-300" },
  games: { label: "ゲーム", badgeClass: "border-violet-200 bg-violet-100/70 text-violet-700", panelClass: "bg-violet-50/30", borderClass: "border-violet-200", hoverBorderClass: "hover:border-violet-300" },
  casual: { label: "雑談", badgeClass: "border-gray-200 bg-gray-100/80 text-gray-700", panelClass: "bg-gray-50/40", borderClass: "border-gray-300", hoverBorderClass: "hover:border-gray-400" },
  other: { label: "その他", badgeClass: "border-slate-200 bg-slate-100/80 text-slate-600", panelClass: "bg-slate-50/40", borderClass: "border-slate-300", hoverBorderClass: "hover:border-slate-400" },
};

export const topicCategoryOptions = topicCategories.map((value) => ({ value, label: topicCategoryPresentation[value].label }));

export function normalizeTopicCategory(value: unknown): TopicCategory {
  return topicCategories.includes(value as TopicCategory) ? value as TopicCategory : "other";
}

export function getTopicCategoryPresentation(value: unknown): TopicCategoryPresentation {
  return topicCategoryPresentation[normalizeTopicCategory(value)];
}

export function getTopicCategoryStyle(value: unknown): string {
  return getTopicCategoryPresentation(value).badgeClass;
}

export function getTopicCategoryLabel(value: unknown): string {
  return getTopicCategoryPresentation(value).label;
}
