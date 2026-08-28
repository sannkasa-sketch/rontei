export type TopicRecentActivity = { posts_last_24h: number };

export const emptyTopicRecentActivity: TopicRecentActivity = { posts_last_24h: 0 };

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function normalizeTopicRecentActivity(data: unknown): TopicRecentActivity {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return emptyTopicRecentActivity;
  return { posts_last_24h: safeCount((value as Record<string, unknown>).posts_last_24h) };
}

export function createTopicRecentActivityMap(data: unknown): Map<string, TopicRecentActivity> {
  const activities = new Map<string, TopicRecentActivity>();
  if (!Array.isArray(data)) return activities;
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const topicId = String(row.topic_id ?? "");
    if (topicId) activities.set(topicId, { posts_last_24h: safeCount(row.posts_last_24h) });
  }
  return activities;
}
