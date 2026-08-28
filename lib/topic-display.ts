const debateTypeLabels: Record<string, string> = {
  superiority: "優劣",
  binary: "白黒",
  exploration: "模索",
  casual: "団欒",
  recruitment: "募集",
};

export const debateTypeOptions = [
  { value: "superiority", label: "優劣" },
  { value: "binary", label: "白黒" },
  { value: "exploration", label: "模索" },
  { value: "casual", label: "団欒" },
  { value: "recruitment", label: "募集" },
] as const;

const topicStatusLabels: Record<string, string> = {
  active: "討論中",
  closed: "討論終了",
  ended: "討論終了",
};

export function getDebateTypeLabel(value: string): string {
  return debateTypeLabels[value] ?? value;
}

export function getTopicStatusLabel(value: string): string {
  return topicStatusLabels[value] ?? value;
}

export function isTopicEnded(status: string, endsAt: string | null, now = new Date(), inactivity?: { timeoutMinutes: number | null; lastPostAt: string | null; createdAt: string }): boolean {
  if (status !== "active") return true;
  if (inactivity?.timeoutMinutes != null) {
    const base = new Date(inactivity.lastPostAt ?? inactivity.createdAt).getTime();
    return !Number.isNaN(base) && base + inactivity.timeoutMinutes * 60_000 <= now.getTime();
  }
  if (!endsAt) return false;

  const endTime = new Date(endsAt).getTime();
  return !Number.isNaN(endTime) && now.getTime() >= endTime;
}

export function formatTopicEndDate(value: string | null): string | undefined {
  if (!value) return undefined;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
