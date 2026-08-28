export type TopicPublicStats = {
  participant_count: number;
  total_posts: number;
  main_posts: number;
  reply_posts: number;
};

export type TopicPublicStatsRow = TopicPublicStats & {
  topic_id: string;
};

export const emptyTopicPublicStats: TopicPublicStats = {
  participant_count: 0,
  total_posts: 0,
  main_posts: 0,
  reply_posts: 0,
};

function safeCount(value: unknown): number {
  const count = Number(value ?? 0);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

export function normalizeTopicPublicStats(data: unknown): TopicPublicStats {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== "object") return emptyTopicPublicStats;
  const row = value as Record<string, unknown>;
  return {
    participant_count: safeCount(row.participant_count),
    total_posts: safeCount(row.total_posts),
    main_posts: safeCount(row.main_posts),
    reply_posts: safeCount(row.reply_posts),
  };
}

export function createTopicPublicStatsMap(data: unknown): Map<string, TopicPublicStats> {
  const stats = new Map<string, TopicPublicStats>();
  if (!Array.isArray(data)) return stats;
  for (const value of data) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const topicId = String(row.topic_id ?? "");
    if (!topicId) continue;
    stats.set(topicId, {
      participant_count: safeCount(row.participant_count),
      total_posts: safeCount(row.total_posts),
      main_posts: safeCount(row.main_posts),
      reply_posts: safeCount(row.reply_posts),
    });
  }
  return stats;
}
