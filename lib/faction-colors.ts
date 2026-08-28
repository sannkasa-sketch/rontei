const factionTints = [
  "bg-blue-50/40",
  "bg-rose-50/40",
  "bg-amber-50/40",
  "bg-emerald-50/40",
  "bg-violet-50/40",
  "bg-cyan-50/40",
] as const;

const knownFactionTints: Record<string, (typeof factionTints)[number]> = {
  "導入賛成": "bg-blue-50/40",
  "賛成": "bg-blue-50/40",
  "導入反対": "bg-rose-50/40",
  "反対": "bg-rose-50/40",
  "条件付き導入": "bg-amber-50/40",
  "条件付き賛成": "bg-amber-50/40",
};

export function getFactionCardTint(factionName?: string): string {
  if (!factionName || factionName === "派閥なし" || factionName === "不明な派閥") {
    return "bg-white";
  }

  const knownTint = knownFactionTints[factionName];
  if (knownTint) return knownTint;

  let hash = 0;
  for (const character of factionName) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return factionTints[hash % factionTints.length];
}
