export type PostRelationType = "main" | "agree" | "oppose" | "supplement" | "question";
export type PostReplyRelationType = Exclude<PostRelationType, "main">;
export type PostRelationLabel = "本筋" | "賛同" | "反論" | "補足" | "質問";
export type PostRelationTone = "agree" | "oppose" | "supplement" | "question";
export type PostRelationStyle = { badge: string; card: string; mark: string };

export const postRelationLabels: Record<PostRelationType, PostRelationLabel> = {
  main: "本筋",
  agree: "賛同",
  oppose: "反論",
  supplement: "補足",
  question: "質問",
};

export const postRelationStyles: Record<PostReplyRelationType, PostRelationStyle> = {
  agree: { badge: "border-blue-200 bg-blue-50 text-blue-800", card: "border-l-blue-400", mark: "○" },
  oppose: { badge: "border-rose-200 bg-rose-50 text-rose-800", card: "border-l-rose-400", mark: "↔" },
  supplement: { badge: "border-amber-200 bg-amber-50 text-amber-800", card: "border-l-amber-400", mark: "+" },
  question: { badge: "border-violet-200 bg-violet-50 text-violet-800", card: "border-l-violet-400", mark: "?" },
};

const contextualSupplementStyles: Record<"agree" | "oppose", PostRelationStyle> = {
  agree: { badge: "border-teal-200 bg-teal-50 text-teal-800", card: "border-l-teal-400", mark: "+" },
  oppose: { badge: "border-orange-200 bg-orange-50 text-orange-800", card: "border-l-orange-400", mark: "+" },
};

export function resolvePostRelationAppearance(
  relationType: PostReplyRelationType,
  parentTone?: PostRelationTone,
): { tone: PostRelationTone; style: PostRelationStyle } {
  if (relationType !== "supplement") {
    return { tone: relationType, style: postRelationStyles[relationType] };
  }

  if (parentTone === "agree" || parentTone === "oppose") {
    return { tone: parentTone, style: contextualSupplementStyles[parentTone] };
  }

  return { tone: "supplement", style: postRelationStyles.supplement };
}

export function getPostRelationLabel(type: PostRelationType): PostRelationLabel {
  return postRelationLabels[type];
}
