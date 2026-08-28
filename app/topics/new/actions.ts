"use server";

import { createClient } from "@/lib/supabase/server";
import { debateTypeOptions } from "@/lib/topic-display";
import { normalizeTopicCategory, type TopicCategory } from "@/lib/topic-category";
import { isFixedRoleDebateType } from "@/lib/debate-format";

export type CreateTopicInput = {
  title: string;
  summary: string;
  content: string;
  purpose: string;
  debateType: string;
  category: TopicCategory;
  endsAt: string | null;
  factions: string[];
  nameMode: string;
  werewolfRevealMode: "never" | "after_end";
  maxPostsPerMember: number | null;
  requireFaction: boolean;
  allowFactionChange: boolean;
  allowMultipleFactions: boolean;
  allowFactionAddition: boolean;
  allowDeception: boolean;
  minEvaluationPoints: number | null;
  creatorSpeakerName: string;
  endMode: "fixed" | "inactivity";
  inactivityTimeoutMinutes: number | null;
  shuffleFactions: boolean;
  showLiveVoteCounts: boolean;
};

export type CreateTopicResult = { success: false; message: string } | { success: true; slug: string };

export async function createTopic(input: CreateTopicInput): Promise<CreateTopicResult> {
  const title = input.title.trim();
  const content = input.content.trim();
  const summary = input.summary.trim();
  const purpose = input.purpose.trim();
  const factions = input.factions.map((name) => name.trim()).filter(Boolean);
  const fixedRoles = isFixedRoleDebateType(input.debateType);
  const creatorSpeakerName = input.creatorSpeakerName.trim();

  if (title.length < 2) return { success: false, message: "タイトルは2文字以上で入力してください。" };
  if (content.length < 1) return { success: false, message: "内容を入力してください。" };
  if (!debateTypeOptions.some((option) => option.value === input.debateType)) return { success: false, message: "討論タイプを選択してください。" };
  const category = normalizeTopicCategory(input.category);
  if (factions.length === 0) return { success: false, message: "派閥を1つ以上入力してください。" };
  if (new Set(factions).size !== factions.length) return { success: false, message: "同じ派閥名を複数使用することはできません。" };
  if (!["anonymous", "topic_alias", "account", "werewolf"].includes(input.nameMode)) return { success: false, message: "記名ルールを選択してください。" };
  if (input.debateType === "binary" && input.nameMode === "werewolf") return { success: false, message: "白黒形式では人狼記名を使用できません" };
  if (fixedRoles && input.nameMode === "werewolf") return { success: false, message: "この討論形式では人狼記名を使用できません" };
  if (fixedRoles && factions.length !== 2) return { success: false, message: "この討論形式では主催側と参加者側の2つの役割を設定してください。" };
  if (input.debateType === "binary" && factions.length < 2) return { success: false, message: "白黒形式では派閥を2つ以上設定してください" };
  if (input.debateType === "superiority" && factions.length < 2) return { success: false, message: "優劣形式では派閥を2つ以上設定してください" };
  if (input.nameMode === "werewolf" && factions.length !== 2) return { success: false, message: "人狼記名では派閥を2つ設定してください。" };
  if (!["never", "after_end"].includes(input.werewolfRevealMode)) return { success: false, message: "人狼の正体公開設定を確認してください。" };
  if (input.maxPostsPerMember !== null && (!Number.isInteger(input.maxPostsPerMember) || input.maxPostsPerMember < 1)) return { success: false, message: "発言回数は1以上の整数で入力してください。" };
  if (input.minEvaluationPoints !== null && (!Number.isInteger(input.minEvaluationPoints) || input.minEvaluationPoints < 0)) return { success: false, message: "必要評価ポイントは0以上の整数で入力してください。" };
  if ((fixedRoles || input.shuffleFactions) && input.nameMode === "topic_alias" && (creatorSpeakerName.length < 2 || creatorSpeakerName.length > 30)) return { success: false, message: "あなたの発言名は2〜30文字で入力してください。" };
  if (!['fixed', 'inactivity'].includes(input.endMode)) return { success: false, message: "終了条件を選択してください。" };
  if (input.endMode === "fixed" && !input.endsAt) return { success: false, message: "終了日時を指定してください。" };
  const validInactivityMinutes = input.inactivityTimeoutMinutes !== null && (
    (input.inactivityTimeoutMinutes >= 10 && input.inactivityTimeoutMinutes <= 50)
    || (input.inactivityTimeoutMinutes >= 60 && input.inactivityTimeoutMinutes <= 23 * 60 && input.inactivityTimeoutMinutes % 60 === 0)
    || (input.inactivityTimeoutMinutes >= 1440 && input.inactivityTimeoutMinutes <= 7 * 1440 && input.inactivityTimeoutMinutes % 1440 === 0)
  );
  if (input.endMode === "inactivity" && !validInactivityMinutes) return { success: false, message: "最終発言から終了までの時間を、分は10～50、時間は1～23、日は1～7で指定してください。" };
  if (input.shuffleFactions && input.nameMode === "werewolf") return { success: false, message: "人狼記名ではシャッフルを使用できません。" };

  let endsAt: string | null = null;
  if (input.endMode === "fixed" && input.endsAt) {
    const date = new Date(input.endsAt);
    if (Number.isNaN(date.getTime())) return { success: false, message: "終了日時を確認してください。" };
    const now = Date.now();
    if (date.getTime() <= now || date.getTime() > now + 14 * 24 * 60 * 60 * 1000) return { success: false, message: "終了日時は現在より未来、かつ2週間以内で指定してください。" };
    endsAt = date.toISOString();
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { success: false, message: "ログイン状態が切れています。再度ログインしてください。" };

  const { data: createdTopicId, error: rpcError } = await supabase.rpc("create_topic_with_rules", {
    p_title: title,
    p_summary: summary || null,
    p_content: content,
    p_purpose: purpose || null,
    p_debate_type: input.debateType,
    p_ends_at: endsAt,
    p_factions: factions,
    p_name_mode: input.nameMode,
    p_max_posts_per_member: input.maxPostsPerMember,
    p_require_faction: true,
    p_allow_faction_change: input.shuffleFactions || fixedRoles ? false : input.debateType === "binary" ? true : input.nameMode === "werewolf" ? false : input.allowFactionChange,
    p_allow_multiple_factions: input.shuffleFactions || fixedRoles || input.debateType === "binary" || input.nameMode === "werewolf" ? false : input.allowMultipleFactions,
    p_allow_faction_addition: input.shuffleFactions || fixedRoles || input.debateType === "binary" || input.nameMode === "werewolf" ? false : input.allowFactionAddition,
    p_allow_deception: input.allowDeception,
    p_min_evaluation_points: input.minEvaluationPoints,
  });

  if (rpcError || !createdTopicId) {
    if (rpcError?.message.toLowerCase().includes("auth")) return { success: false, message: "ログイン状態が切れています。再度ログインしてください。" };
    const databaseMessage = rpcError?.message ?? "";
    if (databaseMessage.includes("白黒形式では派閥を2つ")) return { success: false, message: "白黒形式では派閥を2つ以上設定してください" };
    if (databaseMessage.includes("白黒形式では派閥移動を許可")) return { success: false, message: "白黒形式では派閥移動を許可してください" };
    if (databaseMessage.includes("白黒形式では派閥追加を使用できません")) return { success: false, message: "白黒形式では派閥追加を使用できません" };
    if (databaseMessage.includes("優劣形式では派閥を2つ以上")) return { success: false, message: "優劣形式では派閥を2つ以上設定してください" };
    return { success: false, message: "議題を作成できませんでした。入力内容を確認してもう一度お試しください。" };
  }

  const { error: categoryError } = await supabase.rpc("set_topic_category", {
    p_topic_id: createdTopicId,
    p_category: category,
  });

  let liveVoteCountsFailed = false;
  if (input.debateType === "binary") {
    const result = await supabase.rpc("set_binary_live_vote_counts", {
      p_topic_id: createdTopicId,
      p_show_live_vote_counts: input.showLiveVoteCounts,
    });
    liveVoteCountsFailed = Boolean(result.error);
  }

  let revealModeFailed = false;
  if (input.nameMode === "werewolf") {
    const result = await supabase.rpc("set_werewolf_reveal_mode", {
      p_topic_id: createdTopicId,
      p_reveal_mode: input.werewolfRevealMode,
    });
    revealModeFailed = Boolean(result.error);
  }

  if (categoryError) return { success: false, message: "議題は作成されましたが、カテゴリを保存できませんでした。DBの初期値（その他）が適用されます。" };
  if (revealModeFailed) return { success: false, message: "議題は作成されましたが、正体公開設定を保存できませんでした。安全のためDBの初期値（永久に非公開）が適用されます。" };
  if (liveVoteCountsFailed) return { success: false, message: "議題は作成されましたが、途中票数の公開設定を保存できませんでした。安全のため終了まで非公開になります。" };

  const { error: advancedRulesError } = await supabase.rpc("set_topic_advanced_rules", {
    p_topic_id: createdTopicId,
    p_end_mode: input.endMode,
    p_inactivity_timeout_minutes: input.endMode === "inactivity" ? input.inactivityTimeoutMinutes : null,
    p_shuffle_factions: input.shuffleFactions,
  });
  if (advancedRulesError) return { success: false, message: "議題は作成されましたが、終了条件またはシャッフル設定を保存できませんでした。" };

  if (fixedRoles || input.shuffleFactions) {
    const { data: creatorFaction, error: factionError } = await supabase.from("factions").select("id").eq("topic_id", String(createdTopicId)).eq("sort_order", 1).maybeSingle();
    if (factionError || !creatorFaction) return { success: false, message: "議題は作成されましたが、主催側への参加を設定できませんでした。" };
    const { error: joinError } = await supabase.rpc("join_topic", {
      p_topic_id: createdTopicId,
      p_speaker_name: input.nameMode === "topic_alias" ? creatorSpeakerName : null,
      p_faction_id: creatorFaction.id,
    });
    if (joinError) return { success: false, message: "議題は作成されましたが、主催側への自動参加に失敗しました。議題一覧からご確認ください。" };
  }

  const { data: topic, error: topicError } = await supabase
    .from("topics")
    .select("id, slug")
    .eq("id", String(createdTopicId))
    .maybeSingle();

  if (topicError || !topic?.slug) return { success: false, message: "議題は作成されましたが、移動先を取得できませんでした。議題一覧からご確認ください。" };
  return { success: true, slug: topic.slug };
}
