"use server";

import { createClient } from "@/lib/supabase/server";
import type { PostReactionType } from "@/lib/post-reactions";
import { defaultTopicRules, type NameMode } from "@/lib/topic-rules";
import type { PostRelationType } from "@/lib/post-relations";

export type JoinTopicResult = { success: boolean; message: string };
export type JoinWerewolfTopicResult = { success: boolean; message: string };
export type CreatePostResult = { success: boolean; message: string };
export type CreatePostRelation = PostRelationType;
export type SetReactionResult = { success: boolean; message: string };

export async function joinWerewolfTopic(slug: string, primaryFactionId: string, faction1Id: string, faction1Name: string, faction2Id: string, faction2Name: string): Promise<JoinWerewolfTopicResult> {
  const alias1 = faction1Name.trim();
  const alias2 = faction2Name.trim();
  if (alias1.length < 2 || alias1.length > 30 || alias2.length < 2 || alias2.length > 30) return { success: false, message: "発言名はそれぞれ2〜30文字で入力してください。" };
  if (alias1 === alias2) return { success: false, message: "2つの発言名には別の名前を設定してください。" };
  if (!primaryFactionId) return { success: false, message: "最初に表示する立場を選択してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { success: false, message: "参加するにはログインしてください。" };
  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };
  const { data: rules, error: rulesError } = await supabase.from("topic_rules").select("name_mode").eq("topic_id", topic.id).maybeSingle();
  if (rulesError || rules?.name_mode !== "werewolf") return { success: false, message: "この討論は人狼記名モードではありません。" };

  const { data: topicFactions, error: factionsError } = await supabase.from("factions").select("id").eq("topic_id", topic.id).order("sort_order", { ascending: true });
  if (factionsError || !topicFactions || topicFactions.length !== 2) return { success: false, message: "人狼記名には2つの派閥が必要です。" };
  const expectedIds = topicFactions.map((faction) => String(faction.id));
  if (expectedIds[0] !== faction1Id || expectedIds[1] !== faction2Id || !expectedIds.includes(primaryFactionId)) return { success: false, message: "派閥情報を確認できませんでした。" };

  const { error } = await supabase.rpc("join_werewolf_topic", {
    p_topic_id: topic.id,
    p_primary_faction_id: primaryFactionId,
    p_faction_1_id: faction1Id,
    p_faction_1_name: alias1,
    p_faction_2_id: faction2Id,
    p_faction_2_name: alias2,
  });
  if (error) {
    const original = error.message;
    const lower = original.toLowerCase();
    if (original.includes("発言名") && (original.includes("使用") || original.includes("存在")) || lower.includes("duplicate") || lower.includes("unique")) return { success: false, message: "その発言名はこの討論ですでに使用されています。" };
    if (original.includes("評価ポイント") || lower.includes("evaluation point")) return { success: false, message: "この討論への参加に必要な評価ポイントが不足しています。" };
    if (original.includes("終了") || lower.includes("closed") || lower.includes("ended")) return { success: false, message: "この討論は終了しています。" };
    if (original.includes("参加") || lower.includes("already joined")) return { success: false, message: "この討論には既に参加しています。" };
    return { success: false, message: "人狼記名で討論に参加できませんでした。" };
  }
  return { success: true, message: "討論に参加しました。" };
}
export type ChangeFactionResult = { success: boolean; message: string };
export type AddFactionResult = { success: boolean; message: string };
export type TopicFactionMembershipResult = { success: boolean; message: string };

async function resolveTopicFaction(slug: string, factionId: string) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { error: "login" as const };
  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { error: "topic" as const };
  const { data: faction, error: factionError } = await supabase.from("factions").select("id").eq("id", factionId).eq("topic_id", topic.id).maybeSingle();
  if (factionError || !faction) return { error: "faction" as const };
  return { supabase, topic, faction };
}

function mapTopicFactionMembershipError(message: string, operation: "add" | "remove"): string {
  const lower = message.toLowerCase();
  if (message.includes("複数派閥") || lower.includes("multiple faction") || lower.includes("not allowed")) return "この討論では複数派閥への所属は許可されていません。";
  if (message.includes("既に所属") || message.includes("すでに所属") || lower.includes("already") || lower.includes("duplicate")) return "この派閥には既に所属しています。";
  if (message.includes("メイン派閥") || lower.includes("primary faction")) return "メイン派閥は所属解除できません。";
  if (message.includes("所属していません") || lower.includes("not a member")) return "この派閥には所属していません。";
  if (message.includes("終了") || lower.includes("closed") || lower.includes("ended")) return "終了した討論では所属派閥を変更できません。";
  return operation === "add" ? "所属派閥を追加できませんでした。" : "所属を解除できませんでした。";
}

export async function addMyTopicFaction(slug: string, factionId: string): Promise<TopicFactionMembershipResult> {
  if (!factionId) return { success: false, message: "追加する派閥を選択してください。" };
  const resolved = await resolveTopicFaction(slug, factionId);
  if ("error" in resolved) return { success: false, message: resolved.error === "login" ? "ログインしてください。" : resolved.error === "topic" ? "議題を確認できませんでした。" : "この議題に属する派閥を選択してください。" };
  const { error } = await resolved.supabase.rpc("add_my_topic_faction", { p_topic_id: resolved.topic.id, p_faction_id: resolved.faction.id });
  if (error) return { success: false, message: mapTopicFactionMembershipError(error.message, "add") };
  return { success: true, message: "所属派閥を追加しました。" };
}

export async function removeMyTopicFaction(slug: string, factionId: string): Promise<TopicFactionMembershipResult> {
  if (!factionId) return { success: false, message: "解除する派閥を確認できませんでした。" };
  const resolved = await resolveTopicFaction(slug, factionId);
  if ("error" in resolved) return { success: false, message: resolved.error === "login" ? "ログインしてください。" : resolved.error === "topic" ? "議題を確認できませんでした。" : "この議題に属する派閥を選択してください。" };
  const { error } = await resolved.supabase.rpc("remove_my_topic_faction", { p_topic_id: resolved.topic.id, p_faction_id: resolved.faction.id });
  if (error) return { success: false, message: mapTopicFactionMembershipError(error.message, "remove") };
  return { success: true, message: "所属を解除しました。" };
}

export async function addTopicFaction(slug: string, factionName: string): Promise<AddFactionResult> {
  const name = factionName.trim();
  if (name.length < 1 || name.length > 30) return { success: false, message: "派閥名は1〜30文字で入力してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { success: false, message: "派閥を追加するにはログインしてください。" };

  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };

  const { error } = await supabase.rpc("add_topic_faction", {
    p_topic_id: topic.id,
    p_name: name,
  });
  if (error) {
    const originalMessage = error.message;
    const safeMessage = originalMessage.toLowerCase();
    if (originalMessage.includes("同じ名前") || originalMessage.includes("既に存在") || originalMessage.includes("すでに存在") || safeMessage.includes("duplicate") || safeMessage.includes("unique")) return { success: false, message: "同じ名前の派閥が既に存在します。" };
    if (originalMessage.includes("参加") || safeMessage.includes("member")) return { success: false, message: "派閥を追加するには討論への参加が必要です。" };
    if (originalMessage.includes("許可") || safeMessage.includes("not allowed") || safeMessage.includes("not permit")) return { success: false, message: "この討論では派閥の追加は許可されていません。" };
    if (originalMessage.includes("終了") || safeMessage.includes("closed") || safeMessage.includes("ended")) return { success: false, message: "終了した討論では派閥を追加できません。" };
    if (originalMessage.includes("派閥名") || safeMessage.includes("faction name")) return { success: false, message: "派閥名は1〜30文字で入力してください。" };
    return { success: false, message: "派閥を追加できませんでした。" };
  }

  return { success: true, message: "派閥を追加しました。" };
}

export async function changeTopicFaction(slug: string, newFactionId: string): Promise<ChangeFactionResult> {
  if (!newFactionId) return { success: false, message: "移動先の派閥を選択してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return { success: false, message: "派閥を変更するにはログインしてください。" };

  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };

  const { data: faction, error: factionError } = await supabase
    .from("factions")
    .select("id")
    .eq("id", newFactionId)
    .eq("topic_id", topic.id)
    .maybeSingle();
  if (factionError || !faction) return { success: false, message: "この議題に属する派閥を選択してください。" };

  const { error } = await supabase.rpc("change_topic_faction", {
    p_topic_id: topic.id,
    p_new_faction_id: faction.id,
  });
  if (error) {
    const originalMessage = error.message;
    const safeMessage = originalMessage.toLowerCase();
    if (originalMessage.includes("許可") || safeMessage.includes("not allowed") || safeMessage.includes("not permit")) return { success: false, message: "この討論では派閥の移動は許可されていません。" };
    if (originalMessage.includes("終了") || safeMessage.includes("closed") || safeMessage.includes("ended")) return { success: false, message: "終了した討論では派閥を移動できません。" };
    if (originalMessage.includes("同じ派閥") || safeMessage.includes("same faction")) return { success: false, message: "現在と同じ派閥です。" };
    if (originalMessage.includes("参加") || safeMessage.includes("member")) return { success: false, message: "この討論への参加情報を確認できませんでした。" };
    return { success: false, message: "派閥を変更できませんでした。" };
  }

  return { success: true, message: "派閥を変更しました。" };
}

export async function joinTopic(slug: string, speakerName: string, factionId: string): Promise<JoinTopicResult> {
  if (!factionId) return { success: false, message: "派閥を選択してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return { success: false, message: "参加するにはログインしてください。" };

  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };

  const { data: rules, error: rulesError } = await supabase
    .from("topic_rules")
    .select("name_mode")
    .eq("topic_id", topic.id)
    .maybeSingle();
  if (rulesError) return { success: false, message: "討論ルールを確認できませんでした。" };
  const rawNameMode = rules?.name_mode;
  const nameMode: NameMode = ["anonymous", "topic_alias", "account", "werewolf"].includes(String(rawNameMode))
    ? (rawNameMode as NameMode)
    : defaultTopicRules.name_mode;
  if (nameMode === "werewolf") return { success: false, message: "人狼記名の討論には専用の参加フォームを使用してください。" };

  const name = speakerName.trim();
  if (nameMode === "topic_alias" && (name.length < 2 || name.length > 30)) return { success: false, message: "発言名は2〜30文字で入力してください。" };
  if (nameMode === "account") {
    const { data: profile, error: profileError } = await supabase.from("profiles").select("account_name").eq("id", userId).maybeSingle();
    if (profileError || !profile?.account_name) return { success: false, message: "完全記名の討論に参加するには、先にアカウント名を設定してください。" };
  }

  const { data: faction, error: factionError } = await supabase
    .from("factions")
    .select("id")
    .eq("id", factionId)
    .eq("topic_id", topic.id)
    .maybeSingle();
  if (factionError || !faction) return { success: false, message: "この議題に属する派閥を選択してください。" };

  const { data: existingMember, error: memberError } = await supabase
    .from("topic_members")
    .select("id")
    .eq("topic_id", topic.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (memberError) return { success: false, message: "参加状態を確認できませんでした。" };
  if (existingMember) return { success: false, message: "すでにこの討論に参加しています。" };

  const { error: joinError } = await supabase.rpc("join_topic", {
    p_topic_id: topic.id,
    p_speaker_name: nameMode === "topic_alias" ? name : null,
    p_faction_id: faction.id,
  });

  if (joinError?.code === "23505") {
    const { data: memberAfterConflict } = await supabase
      .from("topic_members")
      .select("id")
      .eq("topic_id", topic.id)
      .eq("user_id", userId)
      .maybeSingle();
    return memberAfterConflict
      ? { success: false, message: "すでにこの討論に参加しています。" }
      : nameMode === "topic_alias"
        ? { success: false, message: "この発言名はこの討論ですでに使用されています。" }
        : { success: false, message: "討論への参加に失敗しました。" };
  }
  if (joinError) {
    const originalMessage = joinError.message;
    const safeMessage = originalMessage.toLowerCase();
    if (originalMessage.includes("既に参加") || originalMessage.includes("すでに参加") || safeMessage.includes("already joined") || safeMessage.includes("already a member")) {
      return { success: false, message: "この討論には既に参加しています。" };
    }
    if (originalMessage.includes("終了") || safeMessage.includes("topic is closed") || safeMessage.includes("topic has ended")) {
      return { success: false, message: "この討論は終了しています。" };
    }
    if (originalMessage.includes("評価ポイント") || safeMessage.includes("evaluation point")) {
      const requiredPoints = originalMessage.match(/(?:評価ポイント)?\s*(\d+)\s*pt以上/i)?.[1]
        ?? originalMessage.match(/required[^\d]*(\d+)/i)?.[1];
      const currentPoints = originalMessage.match(/現在\s*(\d+)\s*pt/i)?.[1]
        ?? originalMessage.match(/current[^\d]*(\d+)/i)?.[1];
      return {
        success: false,
        message: requiredPoints
          ? `この討論への参加には評価ポイント${requiredPoints}pt以上が必要です${currentPoints ? `（現在${currentPoints}pt）` : ""}。`
          : "この討論への参加に必要な評価ポイントが不足しています。",
      };
    }
    if (originalMessage.includes("発言名") || safeMessage.includes("speaker name")) {
      if (originalMessage.includes("使用") || safeMessage.includes("already") || safeMessage.includes("unique")) {
        return { success: false, message: "この発言名はこの討論ですでに使用されています。" };
      }
      return { success: false, message: "発言名は2〜30文字で入力してください。" };
    }
    if (originalMessage.includes("派閥") || safeMessage.includes("faction")) {
      return { success: false, message: "派閥を選択してください。" };
    }
    return { success: false, message: "討論への参加に失敗しました。" };
  }
  return { success: true, message: "討論に参加しました。" };
}

export async function createDebatePost(
  slug: string,
  content: string,
  parentPostId: string | null,
  relationType: CreatePostRelation,
  factionId: string,
): Promise<CreatePostResult> {
  const body = content.trim();
  if (body.length === 0) return { success: false, message: "発言内容を入力してください。" };
  if (body.length > 5000) return { success: false, message: "発言内容は5000文字以内で入力してください。" };
  if (!["main", "agree", "oppose", "supplement", "question"].includes(relationType)) return { success: false, message: "発言の種類が正しくありません。" };
  if ((relationType === "main") !== (parentPostId === null)) return { success: false, message: "返信先または発言の種類が正しくありません。" };
  if (!factionId) return { success: false, message: "発言する立場を選択してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return { success: false, message: "発言するにはログインしてください。" };

  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };

  const { data: membership, error: membershipError } = await supabase
    .from("topic_members")
    .select("id")
    .eq("topic_id", topic.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (membershipError || !membership) return { success: false, message: "発言するにはこの討論に参加してください。" };

  const { data: postingFaction, error: factionError } = await supabase
    .from("factions")
    .select("id")
    .eq("id", factionId)
    .eq("topic_id", topic.id)
    .maybeSingle();
  if (factionError || !postingFaction) return { success: false, message: "この議題に属する派閥を選択してください。" };

  if (parentPostId !== null) {
    const { data: parentPost, error: parentError } = await supabase
      .from("posts")
      .select("id")
      .eq("id", parentPostId)
      .eq("topic_id", topic.id)
      .maybeSingle();
    if (parentError || !parentPost) return { success: false, message: "返信先の発言を確認できませんでした。" };
  }

  const { error: rpcError } = await supabase.rpc("create_post", {
    p_topic_id: topic.id,
    p_content: body,
    p_parent_post_id: parentPostId,
    p_relation_type: relationType,
    p_faction_id: postingFaction.id,
  });

  if (rpcError) {
    const safeMessage = rpcError.message.toLowerCase();
    if (rpcError.message.includes("募集形式") || safeMessage.includes("recruitment") && safeMessage.includes("repl")) {
      return { success: false, message: "募集形式の討論では返信できません。" };
    }
    if (rpcError.message.includes("所属していない派閥") || safeMessage.includes("not a member of") || safeMessage.includes("not affiliated")) {
      return { success: false, message: "所属していない派閥では発言できません。" };
    }
    if (rpcError.message.includes("終了") || safeMessage.includes("topic is closed") || safeMessage.includes("topic has ended")) {
      return { success: false, message: "この討論は終了しています。新しい発言はできません。" };
    }
    if (rpcError.message.includes("発言回数上限") || safeMessage.includes("post limit") || safeMessage.includes("max posts")) {
      const limit = rpcError.message.match(/[（(](\d+)回?[）)]/)?.[1];
      return { success: false, message: limit ? `この討論での発言回数上限（${limit}回）に達しています。` : "この討論での発言回数上限に達しています。" };
    }
    if (rpcError.message.includes("評価ポイント") || safeMessage.includes("evaluation point")) {
      const requiredPoints = rpcError.message.match(/(\d+)\s*pt/i)?.[1];
      return { success: false, message: requiredPoints ? `この討論で発言するには評価ポイント${requiredPoints}pt以上が必要です。` : "この討論で発言するための評価ポイントが不足しています。" };
    }
    if (safeMessage.includes("not a member") || safeMessage.includes("topic member")) return { success: false, message: "発言するにはこの討論に参加してください。" };
    if (safeMessage.includes("content") || safeMessage.includes("5000")) return { success: false, message: "発言内容を確認してください。" };
    if (safeMessage.includes("parent")) return { success: false, message: "返信先の発言を確認できませんでした。" };
    return { success: false, message: "発言に失敗しました。時間をおいてもう一度お試しください。" };
  }

  return { success: true, message: parentPostId ? "返信を発言しました。" : "意見を発言しました。" };
}

export async function setDebatePostReaction(
  slug: string,
  postId: string,
  reactionType: PostReactionType | null,
): Promise<SetReactionResult> {
  if (reactionType !== null && !["agree", "dissatisfied", "skeptical", "uncertain"].includes(reactionType)) {
    return { success: false, message: "評価の種類が正しくありません。" };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return { success: false, message: "評価するにはログインしてください。" };

  const { data: topic, error: topicError } = await supabase.from("topics").select("id").eq("slug", slug).maybeSingle();
  if (topicError || !topic) return { success: false, message: "議題を確認できませんでした。" };

  const { data: post, error: postError } = await supabase
    .from("posts")
    .select("id")
    .eq("id", postId)
    .eq("topic_id", topic.id)
    .maybeSingle();
  if (postError || !post) return { success: false, message: "発言を確認できませんでした。" };

  const { error: reactionError } = reactionType === null
    ? await supabase.rpc("remove_post_reaction", { p_post_id: post.id })
    : await supabase.rpc("set_post_reaction", { p_post_id: post.id, p_reaction_type: reactionType });

  if (reactionError) {
    const safeMessage = reactionError.message.toLowerCase();
    if ((reactionError.message.includes("虚偽") && reactionError.message.includes("懐疑")) || (safeMessage.includes("deception") && safeMessage.includes("skeptical"))) {
      return { success: false, message: "虚偽が許可された討論では「懐疑」は使用できません。" };
    }
    if (safeMessage.includes("own post") || safeMessage.includes("own_posts") || safeMessage.includes("自分")) {
      return { success: false, message: "自分の発言は評価できません。" };
    }
    if (safeMessage.includes("auth") || safeMessage.includes("jwt") || safeMessage.includes("login")) {
      return { success: false, message: "評価するにはログインしてください。" };
    }
    return { success: false, message: "評価を保存できませんでした。" };
  }

  return { success: true, message: reactionType === null ? "評価を解除しました。" : "評価を保存しました。" };
}
