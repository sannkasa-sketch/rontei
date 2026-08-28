export type FactionChangeEvent = {
  from_faction_name: string;
  to_faction_name: string;
  display_name: string;
  moved_at: string;
};

export function formatFactionEventDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  }).format(date);
}
