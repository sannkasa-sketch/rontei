import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FactionBadge } from "@/components/FactionBadge";
import { FactionChangeForm } from "@/components/FactionChangeForm";
import { FactionChangeEventCard } from "@/components/FactionChangeEventCard";
import { FactionAdditionForm } from "@/components/FactionAdditionForm";
import { JoinTopicForm } from "@/components/JoinTopicForm";
import { PostCard } from "@/components/PostCard";
import { MainPostNavigator } from "@/components/MainPostNavigator";
import { TopicStatsSummary } from "@/components/TopicStatsSummary";
import { FloatingPostComposer } from "@/components/FloatingPostComposer";
import { TopicRemainingTime } from "@/components/TopicRemainingTime";
import { CategoryBadge } from "@/components/CategoryBadge";
import { getTopicCategoryPresentation } from "@/lib/topic-category";
import { buildPostTree, type Post } from "@/lib/posts";
import type { FactionChangeEvent } from "@/lib/faction-events";
import type { MyTopicFaction, MyWerewolfAlias } from "@/lib/topic-memberships";
import { TopicFactionMemberships } from "@/components/TopicFactionMemberships";
import {
  createMyReactionMap,
  createReactionCountMap,
  type MyPostReactionRow,
  type PostReactionCountsRow,
} from "@/lib/post-reactions";
import { createClient } from "@/lib/supabase/server";
import {
  defaultTopicRules,
  nameModeDescriptions,
  nameModeLabels,
  type NameMode,
  type TopicRules,
  type WerewolfRevealMode,
} from "@/lib/topic-rules";
import type { WerewolfRevealPair } from "@/lib/werewolf-reveal";
import { emptyTopicPublicStats, normalizeTopicPublicStats, type TopicPublicStats } from "@/lib/topic-public-stats";
import { emptyTopicRecentActivity, normalizeTopicRecentActivity, type TopicRecentActivity } from "@/lib/topic-recent-activity";
import {
  formatTopicEndDate,
  getDebateTypeLabel,
  isTopicEnded,
} from "@/lib/topic-display";

export const dynamic = "force-dynamic";

type DatabaseTopic = {
  id: string | number;
  slug: string;
  title: string;
  summary: string | null;
  content: string | null;
  purpose: string | null;
  debate_type: string;
  category: string | null;
  status: string;
  created_at: string;
  ends_at: string | null;
  last_post_at: string | null;
};

type DatabaseFaction = {
  id: string | number;
  topic_id: string | number;
  name: string;
  description: string | null;
  sort_order: number;
};

type TopicMember = {
  speaker_name: string | null;
  primary_faction_id: string | number | null;
};

type MembershipResult =
  | { status: "anonymous" }
  | { status: "not-joined"; accountName: string | null }
  | { status: "joined"; member: TopicMember; accountName: string | null }
  | { status: "error" };

type PostUsage = {
  used_posts: number;
  max_posts: number | null;
  remaining_posts: number | null;
  is_limited: boolean;
  limit_reached: boolean;
};

type EvaluationRequirement = {
  current_points: number;
  required_points: number | null;
  is_limited: boolean;
  meets_requirement: boolean;
  points_needed: number;
};

type BinaryVoteCount = {
  faction_id: string;
  faction_name: string;
  vote_count: number;
  total_votes: number;
};

const getTopicBySlug = cache(async (slug: string): Promise<DatabaseTopic | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topics")
    .select("id, slug, title, summary, content, purpose, debate_type, category, status, created_at, ends_at, last_post_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch topic from Supabase", {
        code: error.code,
        message: error.message,
      });
    }

    throw new Error("Failed to fetch topic from Supabase");
  }

  return data as DatabaseTopic | null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const topic = await getTopicBySlug(slug);
  if (!topic) return { title: "討論" };
  const description = topic.summary ?? "論庭の公開討論です。";
  return { title: topic.title, description, openGraph: { type: "article", siteName: "論庭", title: topic.title, description } };
}

async function getTopicPublicStats(topicId: DatabaseTopic["id"]): Promise<{ stats: TopicPublicStats; failed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_topic_public_stats", { p_topic_id: topicId });
  return { stats: error ? emptyTopicPublicStats : normalizeTopicPublicStats(data), failed: Boolean(error) };
}

async function getTopicRecentActivity(topicId: DatabaseTopic["id"]): Promise<{ activity: TopicRecentActivity; failed: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_topic_recent_activity", { p_topic_id: topicId });
  return { activity: error ? emptyTopicRecentActivity : normalizeTopicRecentActivity(data), failed: Boolean(error) };
}

async function getFactionsByTopicId(topicId: DatabaseTopic["id"]): Promise<{
  factions: DatabaseFaction[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("factions")
    .select("id, topic_id, name, description, sort_order")
    .eq("topic_id", topicId)
    .order("sort_order", { ascending: true });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch factions from Supabase", {
        code: error.code,
        message: error.message,
      });
    }

    return { factions: [], failed: true };
  }

  return { factions: (data ?? []) as DatabaseFaction[], failed: false };
}

async function getPostsByTopicId(topicId: DatabaseTopic["id"]): Promise<{
  posts: Post[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posts")
    .select("id, topic_id, faction_id, previous_faction_id, parent_post_id, relation_type, author_name, content, created_at")
    .eq("topic_id", topicId);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch posts from Supabase", {
        code: error.code,
        message: error.message,
      });
    }

    return { posts: [], failed: true };
  }

  return { posts: (data ?? []) as Post[], failed: false };
}

async function getCurrentMembership(topicId: DatabaseTopic["id"]): Promise<MembershipResult> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return { status: "anonymous" };

  const [membershipResult, profileResult] = await Promise.all([
    supabase
      .from("topic_members")
      .select("speaker_name, primary_faction_id")
      .eq("topic_id", topicId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("profiles").select("account_name").eq("id", userId).maybeSingle(),
  ]);

  if (membershipResult.error || profileResult.error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch the current participant data", {
        membershipCode: membershipResult.error?.code,
        profileCode: profileResult.error?.code,
      });
    }
    return { status: "error" };
  }

  const accountName = profileResult.data?.account_name ?? null;
  return membershipResult.data
    ? { status: "joined", member: membershipResult.data as TopicMember, accountName }
    : { status: "not-joined", accountName };
}

const validNameModes: NameMode[] = ["anonymous", "topic_alias", "account", "werewolf"];

async function getTopicRules(topicId: DatabaseTopic["id"]): Promise<TopicRules> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("topic_rules")
    .select("topic_id, name_mode, require_faction, allow_faction_change, allow_faction_addition, allow_multiple_factions, allow_deception, max_posts_per_member, min_evaluation_points, werewolf_reveal_mode, end_mode, inactivity_timeout_minutes, shuffle_factions, show_live_vote_counts")
    .eq("topic_id", topicId)
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch topic rules", { code: error.code, message: error.message });
    }
    return { topic_id: topicId, ...defaultTopicRules };
  }

  const nameMode = validNameModes.includes(data?.name_mode as NameMode)
    ? (data?.name_mode as NameMode)
    : defaultTopicRules.name_mode;
  return {
    topic_id: data?.topic_id ?? topicId,
    name_mode: nameMode,
    require_faction: data?.require_faction ?? defaultTopicRules.require_faction,
    allow_faction_change: data?.allow_faction_change ?? defaultTopicRules.allow_faction_change,
    allow_faction_addition: data?.allow_faction_addition ?? defaultTopicRules.allow_faction_addition,
    allow_multiple_factions: data?.allow_multiple_factions ?? defaultTopicRules.allow_multiple_factions,
    allow_deception: data?.allow_deception ?? defaultTopicRules.allow_deception,
    max_posts_per_member: data?.max_posts_per_member ?? defaultTopicRules.max_posts_per_member,
    min_evaluation_points: data?.min_evaluation_points ?? defaultTopicRules.min_evaluation_points,
    werewolf_reveal_mode: (["never", "after_end"] as WerewolfRevealMode[]).includes(data?.werewolf_reveal_mode as WerewolfRevealMode)
      ? data?.werewolf_reveal_mode as WerewolfRevealMode
      : defaultTopicRules.werewolf_reveal_mode,
    end_mode: data?.end_mode === "inactivity" ? "inactivity" : "fixed",
    inactivity_timeout_minutes: data?.inactivity_timeout_minutes ?? null,
    shuffle_factions: data?.shuffle_factions ?? false,
    show_live_vote_counts: data?.show_live_vote_counts ?? false,
  };
}

async function getBinaryVoteCounts(topicId: DatabaseTopic["id"], debateType: string): Promise<{ rows: BinaryVoteCount[]; failed: boolean }> {
  if (debateType !== "binary") return { rows: [], failed: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_binary_final_result", { p_topic_id: topicId });
  if (error) return { rows: [], failed: true };
  return {
    rows: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      faction_id: String(row.faction_id),
      faction_name: String(row.faction_name),
      vote_count: Number(row.vote_count ?? 0),
      total_votes: Number(row.total_votes ?? 0),
    })),
    failed: false,
  };
}

async function getReactionCounts(topicId: DatabaseTopic["id"]): Promise<{
  rows: PostReactionCountsRow[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_post_reaction_counts", { p_topic_id: topicId });
  if (error) return { rows: [], failed: true };
  return { rows: (data ?? []) as PostReactionCountsRow[], failed: false };
}

async function getMyPostReactions(topicId: DatabaseTopic["id"]): Promise<MyPostReactionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_post_reactions", { p_topic_id: topicId });
  if (error) return [];
  return (data ?? []) as MyPostReactionRow[];
}

async function getFactionChangeEvents(topicId: DatabaseTopic["id"]): Promise<{
  events: FactionChangeEvent[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_faction_change_events", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch public faction change events", { code: error.code, message: error.message });
    }
    return { events: [], failed: true };
  }
  return { events: (data ?? []) as FactionChangeEvent[], failed: false };
}

async function getWerewolfRevealPairs(topicId: DatabaseTopic["id"]): Promise<{
  pairs: WerewolfRevealPair[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_werewolf_reveal_pairs", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch werewolf reveal pairs", { code: error.code, message: error.message });
    }
    return { pairs: [], failed: true };
  }
  return { pairs: (data ?? []) as WerewolfRevealPair[], failed: false };
}

async function getMyPostUsage(topicId: DatabaseTopic["id"]): Promise<{
  usage: PostUsage | null;
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_post_usage", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch the current user's post usage", { code: error.code, message: error.message });
    }
    return { usage: null, failed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { usage: null, failed: true };
  return {
    usage: {
      used_posts: Number(row.used_posts ?? 0),
      max_posts: row.max_posts == null ? null : Number(row.max_posts),
      remaining_posts: row.remaining_posts == null ? null : Number(row.remaining_posts),
      is_limited: Boolean(row.is_limited),
      limit_reached: Boolean(row.limit_reached),
    },
    failed: false,
  };
}

async function getMyTopicFactions(topicId: DatabaseTopic["id"]): Promise<{
  factions: MyTopicFaction[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_topic_factions", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch the current user's topic factions", { code: error.code, message: error.message });
    }
    return { factions: [], failed: true };
  }
  return {
    factions: ((data ?? []) as { faction_id: string | number; faction_name: string; is_primary: boolean }[]).map((faction) => ({
      faction_id: String(faction.faction_id),
      faction_name: faction.faction_name,
      is_primary: Boolean(faction.is_primary),
    })),
    failed: false,
  };
}

async function getMyWerewolfAliases(topicId: DatabaseTopic["id"], primaryFactionId: string): Promise<{
  aliases: MyWerewolfAlias[];
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_werewolf_aliases", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch the current user's werewolf aliases", { code: error.code, message: error.message });
    }
    return { aliases: [], failed: true };
  }
  return {
    aliases: ((data ?? []) as { faction_id: string | number; faction_name: string; speaker_name: string }[]).map((alias) => ({
      faction_id: String(alias.faction_id),
      faction_name: alias.faction_name,
      speaker_name: alias.speaker_name,
      is_primary: String(alias.faction_id) === primaryFactionId,
    })),
    failed: false,
  };
}

async function getMyEvaluationRequirement(topicId: DatabaseTopic["id"]): Promise<{
  requirement: EvaluationRequirement | null;
  failed: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_evaluation_requirement", { p_topic_id: topicId });
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to fetch the current user's evaluation requirement", { code: error.code, message: error.message });
    }
    return { requirement: null, failed: true };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { requirement: null, failed: true };
  return {
    requirement: {
      current_points: Number(row.current_points ?? 0),
      required_points: row.required_points == null ? null : Number(row.required_points),
      is_limited: Boolean(row.is_limited),
      meets_requirement: Boolean(row.meets_requirement),
      points_needed: Number(row.points_needed ?? 0),
    },
    failed: false,
  };
}

export default async function DebatePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const params = await props.params;
  const slug = params.slug;
  const topic = await getTopicBySlug(slug);

  if (!topic) notFound();
  const [factionsResult, postsResult, membership, reactionCountsResult, topicRules, factionEventsResult, publicStatsResult, recentActivityResult, binaryVoteCountsResult] = await Promise.all([
    getFactionsByTopicId(topic.id),
    getPostsByTopicId(topic.id),
    getCurrentMembership(topic.id),
    getReactionCounts(topic.id),
    getTopicRules(topic.id),
    getFactionChangeEvents(topic.id),
    getTopicPublicStats(topic.id),
    getTopicRecentActivity(topic.id),
    getBinaryVoteCounts(topic.id, topic.debate_type),
  ]);
  const topicEnded = isTopicEnded(topic.status, topic.ends_at, new Date(), topicRules.end_mode === "inactivity" ? { timeoutMinutes: topicRules.inactivity_timeout_minutes, lastPostAt: topic.last_post_at, createdAt: topic.created_at } : undefined);
  const { factions, failed: factionsFailed } = factionsResult;
  const { posts, failed: postsFailed } = postsResult;
  const { stats: publicStats, failed: publicStatsFailed } = publicStatsResult;
  const { activity: recentActivity, failed: recentActivityFailed } = recentActivityResult;
  const werewolfRevealResult = topicRules.name_mode === "werewolf"
    && topicRules.werewolf_reveal_mode === "after_end"
    && topicEnded
    ? await getWerewolfRevealPairs(topic.id)
    : { pairs: [], failed: false };
  const postUsageResult = membership.status === "joined"
    ? await getMyPostUsage(topic.id)
    : { usage: null, failed: false };
  const myTopicFactionsResult = membership.status === "joined" && topicRules.name_mode !== "werewolf"
    ? await getMyTopicFactions(topic.id)
    : { factions: [], failed: false };
  const membershipPrimaryFactionId = membership.status === "joined" && membership.member.primary_faction_id !== null
    ? String(membership.member.primary_faction_id)
    : "";
  const werewolfAliasesResult = membership.status === "joined" && topicRules.name_mode === "werewolf"
    ? await getMyWerewolfAliases(topic.id, membershipPrimaryFactionId)
    : { aliases: [], failed: false };
  const evaluationResult = membership.status !== "anonymous"
    ? await getMyEvaluationRequirement(topic.id)
    : { requirement: null, failed: false };
  const myReactionRows = membership.status === "anonymous" ? [] : await getMyPostReactions(topic.id);
  const factionNames = new Map(factions.map((faction) => [String(faction.id), faction.name]));
  const postTree = buildPostTree(
    posts,
    factionNames,
    createReactionCountMap(reactionCountsResult.rows),
    createMyReactionMap(myReactionRows),
    !reactionCountsResult.failed,
  );
  const postNumbers = new Map(postTree.map((post, index) => [post.id, postTree.length - index]));
  const mainPostNavigationItems = postTree.map((post) => ({
    anchorId: `main-post-${post.id}`,
    postId: post.id,
    number: postNumbers.get(post.id) ?? 1,
  }));
  const mainTimeline = [
    ...postTree.map((post) => ({ kind: "post" as const, occurredAt: post.createdAt, post })),
    ...factionEventsResult.events.map((event) => ({ kind: "faction-change" as const, occurredAt: event.moved_at, event })),
  ].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  const memberFaction = membership.status === "joined"
    ? membership.member.primary_faction_id === null
      ? "派閥なし"
      : factionNames.get(String(membership.member.primary_faction_id)) ?? "不明な派閥"
    : "派閥なし";
  const primaryFactionId = membershipPrimaryFactionId;
  const postingFactions: MyTopicFaction[] = topicRules.name_mode === "werewolf"
    ? werewolfAliasesResult.aliases
    : myTopicFactionsResult.factions.length > 0
    ? myTopicFactionsResult.factions
    : primaryFactionId
      ? [{ faction_id: primaryFactionId, faction_name: memberFaction, is_primary: true }]
      : [];
  const nameMode = topicRules.name_mode;
  const canPost = membership.status === "joined";
  const limitReached = postUsageResult.usage?.limit_reached === true;
  const pointsInsufficient = evaluationResult.requirement?.is_limited === true
    && evaluationResult.requirement.meets_requirement === false;
  const factionSelectionUnavailable = membership.status === "joined" && postingFactions.length === 0;
  const canCreatePost = canPost && !topicEnded && !limitReached && !pointsInsufficient && !factionSelectionUnavailable;
  const showParticipantPanel = membership.status === "joined" && !topicEnded;
  const floatingPostDisabledReason = pointsInsufficient
    ? "評価ポイントが発言条件を下回っています"
    : limitReached
      ? "発言上限に到達"
      : factionSelectionUnavailable
        ? "所属派閥を確認できません"
        : undefined;
  const replyDisabledReason = [
    topicEnded ? "この討論は終了しています" : null,
    pointsInsufficient ? "評価ポイントが発言条件を下回っています" : null,
    limitReached ? "発言回数の上限に達しています" : null,
    factionSelectionUnavailable ? "所属派閥を確認できません" : null,
  ].filter(Boolean).join("／") || undefined;
  const joinedIdentity = membership.status === "joined"
    ? nameMode === "anonymous"
      ? { label: "表示名", value: "匿名" }
      : nameMode === "account"
        ? { label: "表示名", value: membership.accountName ?? "未設定" }
        : nameMode === "topic_alias"
          ? { label: "発言名", value: membership.member.speaker_name ?? "未設定" }
          : null
    : null;

  const debateType = getDebateTypeLabel(topic.debate_type);
  const isRecruitment = topic.debate_type === "recruitment";
  const endsAt = formatTopicEndDate(topic.ends_at) ?? "未定";
  const referenceNow = new Date().toISOString();
  const categoryStyle = getTopicCategoryPresentation(topic.category);
  const topicOptions = [
    topicRules.allow_faction_change ? "移動" : null,
    topicRules.allow_multiple_factions ? "複数" : null,
    topicRules.allow_faction_addition ? "追加" : null,
    topicRules.allow_deception ? "虚偽" : null,
    topicRules.max_posts_per_member !== null ? `${topicRules.max_posts_per_member}回まで` : null,
    topicRules.min_evaluation_points !== null ? `${topicRules.min_evaluation_points}pt以上` : null,
    nameMode === "werewolf" ? "人狼" : null,
  ].filter((option): option is string => option !== null);

  return (
    <main className={showParticipantPanel ? "pb-24 sm:pb-28" : undefined}>
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <Link href="/topics" className="text-xs font-bold text-slate-500 hover:text-blue-700">← 議題一覧に戻る</Link>
          <div className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-7 ${categoryStyle.panelClass} ${categoryStyle.borderClass}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2"><span className="text-sm font-black text-blue-800">{debateType}</span><CategoryBadge category={topic.category} /></div>
              <TopicRemainingTime endsAt={topic.ends_at} isEnded={topicEnded} referenceNow={referenceNow} variant="pill" />
            </div>
            <h1 className="mt-3 [overflow-wrap:anywhere] text-2xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">{topic.title}</h1>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-600 sm:text-base">{topic.summary ?? "概要はまだ登録されていません。"}</p>

            <div className={`mt-5 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2 ${categoryStyle.borderClass}`}>
              <section><h2 className="text-xs font-black tracking-wide text-slate-500">議題</h2><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{topic.content ?? "内容はまだ登録されていません。"}</p></section>
              <section><h2 className="text-xs font-black tracking-wide text-slate-500">目的</h2><p className="mt-1 whitespace-pre-wrap leading-6 text-slate-700">{topic.purpose ?? "目的はまだ登録されていません。"}</p></section>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-bold text-slate-500">派閥</span>{factionsFailed ? <span className="text-xs font-semibold text-slate-500">派閥を取得できませんでした</span> : factions.length === 0 ? <span className="text-xs font-semibold text-slate-500">派閥なし</span> : factions.map((faction) => <FactionBadge key={faction.id} name={faction.name} />)}</div>

            {topicOptions.length > 0 && <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[11px] font-bold text-slate-600" aria-label="有効な討論オプション">{topicOptions.map((option) => <span key={option} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-blue-500" />{option}</span>)}</div>}

            <div className={`mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t pt-3 text-xs text-slate-600 ${categoryStyle.borderClass}`}>
              <span>記名：<b className="text-slate-900">{nameModeLabels[nameMode]}</b></span>
              {nameMode === "werewolf" && <span>正体公開：<b className="text-slate-900">{topicRules.werewolf_reveal_mode === "after_end" ? "討論終了時" : "永久に非公開"}</b></span>}
              {topic.ends_at && <span>{topicEnded ? "終了" : "終了予定"}：<b className="text-slate-900">{endsAt}</b></span>}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{nameModeDescriptions[nameMode]}</p>
            {isRecruitment && <p className="mt-2 text-xs leading-5 text-slate-600">募集形式では独立した意見・案を募集します。発言への賛同・反論・補足返信はできません。</p>}
            {topicRules.allow_deception && <div className="mt-2 text-xs leading-5 text-slate-600"><span className="font-bold text-slate-700">虚偽発言</span><p>虚偽が許可されているため「懐疑」評価は使用できません。</p></div>}
            {nameMode === "werewolf" && topicRules.werewolf_reveal_mode === "after_end" && !topicEnded && <p className="mt-2 text-xs text-slate-600">正体は討論終了後に公開されます。</p>}
            {nameMode === "werewolf" && topicRules.werewolf_reveal_mode === "never" && topicEnded && <p className="mt-2 text-xs text-slate-600">この討論では人狼の正体は公開されません。</p>}
            {topic.debate_type === "binary" && !topicEnded && <section className="mt-4 rounded-xl border border-slate-200 bg-white/70 p-4" data-testid="binary-live-vote-summary"><h2 className="text-sm font-black text-slate-900">途中経過</h2>{!topicRules.show_live_vote_counts ? <p className="mt-2 text-xs leading-5 text-slate-600">票数は討論終了まで非公開です。</p> : binaryVoteCountsResult.failed ? <p className="mt-2 text-xs font-semibold text-amber-700">途中経過を取得できませんでした。</p> : binaryVoteCountsResult.rows.length === 0 || binaryVoteCountsResult.rows.every((row) => row.vote_count === 0) ? <p className="mt-2 text-xs leading-5 text-slate-600">まだ票がありません。</p> : <div className="mt-3 flex flex-wrap gap-2">{binaryVoteCountsResult.rows.map((row) => <div key={row.faction_id} data-testid="binary-live-vote-row" className="min-w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><span className="font-bold text-slate-700">{row.faction_name}</span><strong className="ml-3 text-sm text-slate-950">{row.vote_count}人</strong></div>)}</div>}</section>}
          </div>
        </div>
      </section>

      <div className={`mx-auto grid w-full max-w-[1480px] gap-8 px-4 py-6 sm:px-6 lg:gap-5 lg:px-8 lg:py-10 xl:gap-7 ${mainPostNavigationItems.length >= 2 ? "lg:grid-cols-[minmax(0,1fr)_44px]" : "lg:grid-cols-1"}`}>
        <section>
          {nameMode === "werewolf" && topicEnded && topicRules.werewolf_reveal_mode === "after_end" && <section className="panel mb-10 p-5 sm:p-7"><p className="section-kicker">WEREWOLF REVEAL</p><h2 className="text-xl font-black text-slate-900">人狼 正体公開</h2><p className="mt-2 text-sm text-slate-500">以下の2つの発言人格は、同じ参加者によるものです。</p>{werewolfRevealResult.failed ? <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">正体公開情報を取得できませんでした</p> : werewolfRevealResult.pairs.length === 0 ? <p className="mt-5 text-sm font-semibold text-slate-500">公開対象の組み合わせはありません。</p> : <div className="mt-6 grid gap-4 sm:grid-cols-2">{werewolfRevealResult.pairs.map((pair, index) => <article key={`${pair.alias_1}-${pair.alias_2}-${index}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="rounded-lg bg-white px-3 py-2"><b className="text-sm text-slate-900">{pair.alias_1}</b><span className="ml-2 text-xs font-semibold text-slate-500">［{pair.faction_1_name}］</span></div><p className="py-2 text-center text-xs font-bold text-slate-400">⇅ 同一参加者</p><div className="rounded-lg bg-white px-3 py-2"><b className="text-sm text-slate-900">{pair.alias_2}</b><span className="ml-2 text-xs font-semibold text-slate-500">［{pair.faction_2_name}］</span></div></article>)}</div>}</section>}
          {topicEnded && membership.status !== "joined" && <section className="panel mt-10 p-6 text-center sm:p-7"><h2 className="text-lg font-black text-slate-900">この討論は終了しました</h2><p className="mt-2 text-sm text-slate-500">この討論は終了しているため、新しく参加できません。</p></section>}

          {!topicEnded && membership.status === "anonymous" && <section className="panel mt-10 p-6 text-center sm:p-7"><h2 className="text-lg font-black text-slate-900">発言するにはログインしてください</h2><p className="mt-2 text-sm text-slate-500">ログイン後、この討論に参加すると発言できます。</p><Link href="/login" className="button-primary mt-5">ログイン</Link></section>}

          {!topicEnded && membership.status === "not-joined" && <><section className="panel mt-10 px-6 py-5 text-center text-sm font-bold text-slate-700">発言するにはこの討論に参加してください</section>{evaluationResult.failed ? <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">評価ポイント条件を取得できませんでした。参加時にはDB側で条件を確認します。</p> : pointsInsufficient && evaluationResult.requirement ? <section className="panel mt-5 p-5 sm:p-7"><h2 className="text-lg font-black text-slate-900">この討論に参加する</h2><div className="mt-4 rounded-lg bg-amber-50 px-4 py-4 text-sm text-amber-950"><p className="font-bold">この討論への参加・発言には{evaluationResult.requirement.required_points}pt以上必要です</p><p className="mt-2">現在 {evaluationResult.requirement.current_points}pt</p><p className="mt-1">あと{evaluationResult.requirement.points_needed}pt必要です</p></div></section> : <JoinTopicForm slug={slug} factions={factions.map((faction) => ({ id: String(faction.id), name: faction.name }))} nameMode={nameMode} accountName={membership.accountName} debateType={topic.debate_type} shuffleFactions={topicRules.shuffle_factions} />}{evaluationResult.requirement?.is_limited && evaluationResult.requirement.meets_requirement && <p className="mt-3 text-center text-xs font-semibold text-slate-500">評価ポイント {evaluationResult.requirement.current_points}pt / 必要{evaluationResult.requirement.required_points}pt</p>}</>}

          {membership.status === "error" && <section className="panel mt-10 p-6 text-center text-sm font-bold text-slate-600">参加状態を取得できませんでした</section>}

          <TopicStatsSummary participantCount={publicStats.participant_count} totalPosts={publicStats.total_posts} recentPosts={recentActivity.posts_last_24h} mainPosts={publicStats.main_posts} replyPosts={publicStats.reply_posts} endsAt={endsAt} isEnded={topicEnded} publicStatsFailed={publicStatsFailed} recentActivityFailed={recentActivityFailed} />

          <section className="mt-8">
            <div className="mb-6 flex items-end justify-between"><div><p className="section-kicker">MAIN THREAD</p><h2 className="section-title">本筋のタイムライン</h2></div><span className="text-xs text-slate-400">新しい順</span></div>
            {reactionCountsResult.failed && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">評価数を取得できませんでした</p>}
            {factionEventsResult.failed && <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">派閥移動イベントを取得できませんでした</p>}
            {postsFailed ? <div className="panel px-6 py-12 text-center text-sm font-bold text-slate-600">発言を取得できませんでした</div> : mainTimeline.length === 0 ? <div className="panel px-6 py-12 text-center text-sm font-bold text-slate-600">{canCreatePost ? "まだ発言はありません。最初の意見を発言してみましょう。" : "まだ発言はありません。"}</div> : <div id="main-post-timeline" className="space-y-8">{mainTimeline.map((item, index) => item.kind === "post" ? <div key={`post-${item.post.id}`} id={`main-post-${item.post.id}`} data-main-post-anchor className="scroll-mt-32 sm:scroll-mt-24"><PostCard post={item.post} topicSlug={slug} postingFactions={postingFactions} primaryFactionId={primaryFactionId} allowFactionSelection={topicRules.allow_multiple_factions || nameMode === "werewolf"} allowSkepticalReaction={!topicRules.allow_deception} canReply={canCreatePost} allowReplies={!isRecruitment} replyDisabledReason={replyDisabledReason} canReact={membership.status !== "anonymous"} index={postNumbers.get(item.post.id)} stickyMain mainAnchorId={`main-post-${item.post.id}`} /></div> : <FactionChangeEventCard key={`faction-change-${item.event.moved_at}-${index}`} event={item.event} />)}</div>}
          </section>
        </section>

        {mainPostNavigationItems.length >= 2 && <aside className="hidden lg:block" aria-label="本筋位置ナビゲーション">
          <MainPostNavigator items={mainPostNavigationItems} timelineId="main-post-timeline" />
        </aside>}

      </div>
      {showParticipantPanel && membership.status === "joined" && <FloatingPostComposer
        slug={slug}
        factions={postingFactions}
        primaryFactionId={primaryFactionId}
        allowFactionSelection={topicRules.allow_multiple_factions || nameMode === "werewolf"}
        currentFactionName={memberFaction}
        identityLabel={nameMode === "anonymous" ? "記名方式" : nameMode === "account" ? "アカウント名" : "発言名"}
        identityValue={nameMode === "anonymous" ? "匿名で参加中" : nameMode === "account" ? membership.accountName ?? "未設定" : nameMode === "werewolf" ? postingFactions.find((faction) => faction.is_primary)?.speaker_name ?? "立場を選択してください" : membership.member.speaker_name ?? "未設定"}
        remainingPosts={postUsageResult.usage?.is_limited ? postUsageResult.usage.remaining_posts : null}
        canPost={canCreatePost}
        postDisabledReason={floatingPostDisabledReason}
      >
        {topicRules.allow_faction_change && nameMode !== "werewolf" && factions.length > 1 && <FactionChangeForm slug={slug} currentFactionId={membership.member.primary_faction_id === null ? null : String(membership.member.primary_faction_id)} currentFactionName={memberFaction} factions={factions.map((faction) => ({ id: String(faction.id), name: faction.name }))} />}
        {nameMode === "werewolf" && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">本人用の発言名</p>{werewolfAliasesResult.failed ? <p className="mt-2 text-sm font-semibold text-amber-700">発言名を取得できませんでした</p> : <ul className="mt-2 space-y-1 text-sm">{werewolfAliasesResult.aliases.map((alias) => <li key={alias.faction_id}><b>{alias.faction_name}</b>：{alias.speaker_name}{alias.is_primary && <span className="ml-2 text-xs text-slate-400">メイン</span>}</li>)}</ul>}</div>}
        {nameMode !== "werewolf" && topicRules.allow_multiple_factions && (myTopicFactionsResult.failed ? <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">所属派閥を取得できませんでした</p> : <TopicFactionMemberships slug={slug} memberships={myTopicFactionsResult.factions} allFactions={factions.map((faction) => ({ id: String(faction.id), name: faction.name }))} />)}
        {nameMode !== "werewolf" && topicRules.allow_faction_addition && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-black text-slate-900">参加者による派閥追加</p><p className="mt-1 text-xs text-slate-500">派閥を追加しても、現在所属している派閥は変わりません。</p><FactionAdditionForm slug={slug} /></div>}
        {evaluationResult.requirement?.is_limited && <div className={`mt-4 rounded-lg px-4 py-3 ${pointsInsufficient ? "bg-amber-50" : "bg-slate-50"}`}><p className="text-xs font-bold text-slate-500">評価ポイント</p><p className="mt-1 text-sm font-black text-slate-900">{evaluationResult.requirement.current_points}pt / 必要{evaluationResult.requirement.required_points}pt</p></div>}
        {postUsageResult.failed ? <p className="mt-4 text-xs font-semibold text-amber-700">発言回数を取得できませんでした</p> : postUsageResult.usage && <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3"><p className="text-xs font-bold text-slate-500">発言回数</p>{postUsageResult.usage.is_limited ? <p className="mt-1 text-sm font-black text-slate-900">{postUsageResult.usage.used_posts} / {postUsageResult.usage.max_posts}回 使用（残り{postUsageResult.usage.remaining_posts ?? 0}回）</p> : <p className="mt-1 text-sm font-black text-slate-900">無制限</p>}</div>}
      </FloatingPostComposer>}
    </main>
  );
}
