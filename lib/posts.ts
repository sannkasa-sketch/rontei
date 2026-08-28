import { postReactionLabels, type PostReactionType } from "./post-reactions";
import { getPostRelationLabel, type PostRelationLabel, type PostRelationType } from "./post-relations";

export type { PostRelationLabel, PostRelationType } from "./post-relations";

export type Post = {
  id: string | number;
  topic_id: string | number;
  faction_id: string | number | null;
  previous_faction_id: string | number | null;
  parent_post_id: string | number | null;
  relation_type: PostRelationType;
  author_name: string;
  content: string;
  created_at: string;
};

export type PostNode = {
  id: string;
  author: string;
  faction: string;
  previousFaction?: string;
  date: string;
  body: string;
  relation?: Exclude<PostRelationLabel, "本筋">;
  relationType: PostRelationType;
  reactions: { type: PostReactionType; label: string; count: number | null }[];
  myReaction?: PostReactionType;
  replies: PostNode[];
  createdAt: string;
};

function formatPostDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}

export function buildPostTree(
  posts: Post[],
  factionNames: ReadonlyMap<string, string>,
  reactionCounts: ReadonlyMap<string, Record<PostReactionType, number>> = new Map(),
  myReactions: ReadonlyMap<string, PostReactionType> = new Map(),
  reactionCountsAvailable = true,
): PostNode[] {
  const nodes = new Map<string, PostNode>();

  for (const post of posts) {
    const relation = getPostRelationLabel(post.relation_type);
    const postId = String(post.id);
    const counts = reactionCounts.get(postId);
    nodes.set(postId, {
      id: String(post.id),
      author: post.author_name,
      faction: post.faction_id === null ? "派閥なし" : factionNames.get(String(post.faction_id)) ?? "不明な派閥",
      previousFaction: post.previous_faction_id === null
        ? undefined
        : factionNames.get(String(post.previous_faction_id)) ?? "不明な派閥",
      date: formatPostDate(post.created_at),
      body: post.content,
      relation: relation === "本筋" ? undefined : relation,
      relationType: post.relation_type,
      reactions: (Object.entries(postReactionLabels) as [PostReactionType, string][]).map(([type, label]) => ({
        type,
        label,
        count: reactionCountsAvailable ? counts?.[type] ?? 0 : null,
      })),
      myReaction: myReactions.get(postId),
      replies: [],
      createdAt: post.created_at,
    });
  }

  for (const post of posts) {
    if (post.parent_post_id === null) continue;
    const parent = nodes.get(String(post.parent_post_id));
    const child = nodes.get(String(post.id));
    if (parent && child && parent !== child) parent.replies.push(child);
  }

  const sortRepliesOldestFirst = (node: PostNode) => {
    node.replies.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    node.replies.forEach(sortRepliesOldestFirst);
  };

  const roots = posts
    .filter((post) => post.parent_post_id === null && post.relation_type === "main")
    .map((post) => nodes.get(String(post.id)))
    .filter((node): node is PostNode => node !== undefined)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  roots.forEach(sortRepliesOldestFirst);
  return roots;
}
