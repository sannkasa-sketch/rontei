export type NameMode = "anonymous" | "topic_alias" | "account" | "werewolf";
export type WerewolfRevealMode = "never" | "after_end";

export type TopicRules = {
  topic_id: string | number;
  name_mode: NameMode;
  require_faction: boolean;
  allow_faction_change: boolean;
  allow_faction_addition: boolean;
  allow_multiple_factions: boolean;
  allow_deception: boolean;
  max_posts_per_member: number | null;
  min_evaluation_points: number | null;
  werewolf_reveal_mode: WerewolfRevealMode;
  end_mode: "fixed" | "inactivity";
  inactivity_timeout_minutes: number | null;
  shuffle_factions: boolean;
  show_live_vote_counts: boolean;
};

export const defaultTopicRules: Omit<TopicRules, "topic_id"> = {
  name_mode: "topic_alias",
  require_faction: true,
  allow_faction_change: false,
  allow_faction_addition: false,
  allow_multiple_factions: false,
  allow_deception: false,
  max_posts_per_member: null,
  min_evaluation_points: null,
  werewolf_reveal_mode: "never",
  end_mode: "fixed",
  inactivity_timeout_minutes: null,
  shuffle_factions: false,
  show_live_vote_counts: false,
};

export const nameModeLabels: Record<NameMode, string> = {
  anonymous: "完全匿名",
  topic_alias: "議題毎",
  account: "完全記名",
  werewolf: "人狼",
};

export const nameModeDescriptions: Record<NameMode, string> = {
  anonymous: "発言者の名前を表示しません",
  topic_alias: "この議題専用の発言名を使用します",
  account: "アカウント名を表示します",
  werewolf: "立場ごとに発言名を使い分ける特殊ルール",
};
