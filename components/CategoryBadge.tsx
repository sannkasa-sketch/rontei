import { getTopicCategoryPresentation } from "@/lib/topic-category";

export function CategoryBadge({ category }: { category: unknown }) {
  const presentation = getTopicCategoryPresentation(category);
  return <span data-testid="topic-category-badge" className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${presentation.badgeClass}`}>{presentation.label}</span>;
}
