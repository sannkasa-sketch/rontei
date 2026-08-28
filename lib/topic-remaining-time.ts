export type TopicRemainingTimeState = {
  label: string;
  urgency: "normal" | "soon" | "imminent" | "ended";
};

export function getTopicRemainingTime(endsAt: string | null | undefined, nowMs: number, isEnded = false): TopicRemainingTimeState {
  if (isEnded) return { label: "終了", urgency: "ended" };
  if (!endsAt) return { label: "期限なし", urgency: "normal" };
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs) || endMs <= nowMs) return { label: "終了", urgency: "ended" };

  const remainingMs = endMs - nowMs;
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  if (remainingMs < hourMs) return { label: `残り ${Math.max(1, Math.ceil(remainingMs / 60_000))}分`, urgency: "imminent" };
  if (remainingMs < dayMs) return { label: `残り ${Math.floor(remainingMs / hourMs)}時間`, urgency: "soon" };
  return { label: `残り ${Math.max(1, Math.floor(remainingMs / dayMs))}日`, urgency: "normal" };
}
