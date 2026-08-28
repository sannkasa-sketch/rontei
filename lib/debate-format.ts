export const fixedRoleDebateTypes = ["exploration", "casual", "recruitment"] as const;

export type FixedRoleDebateType = (typeof fixedRoleDebateTypes)[number];

export function isFixedRoleDebateType(value: string): value is FixedRoleDebateType {
  return fixedRoleDebateTypes.includes(value as FixedRoleDebateType);
}

export function getDefaultFactionNames(debateType: string): [string, string] {
  return isFixedRoleDebateType(debateType) ? ["主催", "参加者"] : ["賛成", "反対"];
}

export const debateFormatDetails: Record<string, string> = {
  exploration: "意見の模索を行います。それぞれの意見に対して返信が可能です。",
  binary: "各意見の決着をつけます。終了時に最も所属人数が多い派閥が結論となります。",
  superiority: "各意見の優劣をつけます。終了時に各発言につけられた評価から、各派閥の意見の有効性を順位づけます。",
  casual: "雑談用になります。",
  recruitment: "意見の募集を行います。模索と違い返信を行うことができません。",
};
