export type PostReactionType = "agree" | "dissatisfied" | "skeptical" | "uncertain";

export type PostReactionCountsRow = {
  post_id: string | number;
  agree_count: number | string | null;
  dissatisfied_count: number | string | null;
  skeptical_count: number | string | null;
  uncertain_count: number | string | null;
};

export type MyPostReactionRow = {
  post_id: string | number;
  reaction_type: PostReactionType;
};

export const postReactionLabels: Record<PostReactionType, string> = {
  agree: "納得",
  dissatisfied: "不服",
  skeptical: "懐疑",
  uncertain: "微妙",
};

export function createReactionCountMap(rows: PostReactionCountsRow[]) {
  return new Map(rows.map((row) => [String(row.post_id), {
    agree: Number(row.agree_count ?? 0),
    dissatisfied: Number(row.dissatisfied_count ?? 0),
    skeptical: Number(row.skeptical_count ?? 0),
    uncertain: Number(row.uncertain_count ?? 0),
  }]));
}

export function createMyReactionMap(rows: MyPostReactionRow[]) {
  return new Map(rows.map((row) => [String(row.post_id), row.reaction_type]));
}
