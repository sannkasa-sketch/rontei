"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { setDebatePostReaction } from "@/app/topics/actions";
import type { PostReactionType } from "@/lib/post-reactions";
import type { PostNode } from "@/lib/posts";
import { FactionBadge } from "./FactionBadge";
import { PostComposer } from "./PostComposer";
import type { MyTopicFaction } from "@/lib/topic-memberships";
import { getFactionCardTint } from "@/lib/faction-colors";
import { postRelationLabels, postRelationStyles, resolvePostRelationAppearance, type PostRelationTone, type PostRelationType, type PostReplyRelationType } from "@/lib/post-relations";

function countReplies(post: PostNode): number {
  return post.replies?.reduce((total, reply) => total + 1 + countReplies(reply), 0) ?? 0;
}

type VisualReplyItem = {
  post: PostNode;
  isSupplementContinuationItem: boolean;
  branchChildIndex: number | null;
  branchChildCount: number;
  isBranchFirst: boolean;
  isBranchLast: boolean;
  showBranchVerticalAbove: boolean;
  showBranchVerticalBelow: boolean;
  showContinuationLineAbove: boolean;
  showContinuationLineBelow: boolean;
  showBranchDot: boolean;
  showBranchHorizontal: boolean;
};

type BranchTrailItem = {
  id: string;
  relationType: PostRelationType;
  label: string;
  author: string;
  body: string;
};

type BranchTrailEventDetail = {
  mainAnchorId: string;
  trail: BranchTrailItem[];
};

const EMPTY_BRANCH_TRAIL: BranchTrailItem[] = [];

let activeMainFrame: number | null = null;
function publishCurrentMainPost(stickyTop: number) {
  if (activeMainFrame !== null) window.cancelAnimationFrame(activeMainFrame);
  activeMainFrame = window.requestAnimationFrame(() => {
    activeMainFrame = null;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-main-post-anchor]"));
    if (sections.length === 0) return;
    const containingBoundary = sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= stickyTop + 2 && rect.bottom > stickyTop + 2;
    });
    const passedSections = sections.filter((section) => section.getBoundingClientRect().top <= stickyTop + 2);
    const current = containingBoundary ?? passedSections.at(-1) ?? sections[0];
    const currentMainPostId = current.querySelector<HTMLElement>("[data-post-id]")?.dataset.postId;
    if (currentMainPostId) window.dispatchEvent(new CustomEvent("debate:active-main-post", { detail: currentMainPostId }));
  });
}

function branchTrailNodeClass(relationType: PostRelationType): string {
  return relationType === "main"
    ? "border-slate-300 bg-slate-100 text-slate-800"
    : postRelationStyles[relationType].badge;
}

function createVisualReplyItems(parent: PostNode): VisualReplyItem[] {
  const branchChildren = parent.relationType === "supplement"
    ? parent.replies.filter((reply) => reply.relationType !== "supplement")
    : parent.replies;
  const continuationChildren = parent.relationType === "supplement"
    ? parent.replies.filter((reply) => reply.relationType === "supplement")
    : [];
  const orderedChildren = [...branchChildren, ...continuationChildren];
  const lastContinuationIndex = continuationChildren.length > 0 ? orderedChildren.length - 1 : -1;

  return orderedChildren.map((post, visualIndex) => {
    const isSupplementContinuationItem = parent.relationType === "supplement" && post.relationType === "supplement";
    const branchChildIndex = isSupplementContinuationItem ? null : branchChildren.indexOf(post);
    const isBranchFirst = branchChildIndex === 0;
    const isBranchLast = branchChildIndex !== null && branchChildIndex === branchChildren.length - 1;
    return {
      post,
      isSupplementContinuationItem,
      branchChildIndex,
      branchChildCount: branchChildren.length,
      isBranchFirst,
      isBranchLast,
      showBranchVerticalAbove: !isSupplementContinuationItem,
      showBranchVerticalBelow: !isSupplementContinuationItem && !isBranchLast,
      showContinuationLineAbove: lastContinuationIndex >= 0 && visualIndex <= lastContinuationIndex,
      showContinuationLineBelow: lastContinuationIndex >= 0 && visualIndex < lastContinuationIndex,
      showBranchDot: !isSupplementContinuationItem,
      showBranchHorizontal: !isSupplementContinuationItem,
    };
  });
}

const replyActions: { label: string; type: PostReplyRelationType }[] = (["agree", "oppose", "supplement", "question"] as const).map((type) => ({
  label: postRelationLabels[type],
  type,
}));

export function PostCard({ post, topicSlug, postingFactions, primaryFactionId, allowFactionSelection, allowSkepticalReaction, canReply, allowReplies = true, replyDisabledReason, canReact, depth = 0, index, isLast = false, parentRelationTone, parentRelationType, pinnedPostId, onPinPost, stickyMain = false, mainAnchorId, ancestorTrail = EMPTY_BRANCH_TRAIL }: { post: PostNode; topicSlug: string; postingFactions: MyTopicFaction[]; primaryFactionId: string; allowFactionSelection: boolean; allowSkepticalReaction: boolean; canReply: boolean; allowReplies?: boolean; replyDisabledReason?: string; canReact: boolean; depth?: number; index?: number; isLast?: boolean; parentRelationTone?: PostRelationTone; parentRelationType?: PostNode["relationType"]; pinnedPostId?: string | null; onPinPost?: (postId: string | null) => void; stickyMain?: boolean; mainAnchorId?: string; ancestorTrail?: BranchTrailItem[] }) {
  const [showReplies, setShowReplies] = useState(true);
  const router = useRouter();
  const [replyType, setReplyType] = useState<PostReplyRelationType | null>(null);
  const [reactionCounts, setReactionCounts] = useState(post.reactions);
  const [selectedReaction, setSelectedReaction] = useState<PostReactionType | undefined>(post.myReaction);
  const [reactionMessage, setReactionMessage] = useState("");
  const [localPinnedPostId, setLocalPinnedPostId] = useState<string | null>(null);
  const [isStickyMain, setIsStickyMain] = useState(false);
  const [hoveredBranchTrail, setHoveredBranchTrail] = useState<BranchTrailItem[]>([]);
  const [pinnedBranchTrail, setPinnedBranchTrail] = useState<BranchTrailItem[]>([]);
  const stickySentinelRef = useRef<HTMLSpanElement>(null);
  const branchTrailRef = useRef<HTMLElement>(null);
  const [reactionPending, startReactionTransition] = useTransition();
  const isMainPost = depth === 0;
  const followsSupplementAtSameDepth = parentRelationType === "supplement" && post.relationType === "supplement";
  const replyCount = countReplies(post);
  const visualReplies = createVisualReplyItems(post);
  const relationAppearance = post.relation
    ? resolvePostRelationAppearance(post.relationType as PostReplyRelationType, parentRelationTone)
    : null;
  const relation = relationAppearance?.style ?? null;
  const factionTint = getFactionCardTint(post.faction);
  const treeDimensions = followsSupplementAtSameDepth || depth >= 6
    ? "[--tree-indent:0px]"
    : "[--tree-indent:0.4375rem] md:[--tree-indent:1.25rem]";
  const replyWidthLayout = depth === 1 && parentRelationType === "main"
    ? "pr-[calc(var(--tree-max-indent)-var(--tree-indent))]"
    : "w-[calc(100%+var(--tree-indent))]";
  const agreeCount = reactionCounts.find((reaction) => reaction.type === "agree")?.count ?? 0;
  const skepticalCount = reactionCounts.find((reaction) => reaction.type === "skeptical")?.count ?? 0;
  const evaluationScore = agreeCount * 2 - skepticalCount;
  const reactionBreakdown = reactionCounts.map((reaction) => `${reaction.label} ${reaction.count ?? 0}`).join(" / ");
  const activePinnedPostId = pinnedPostId === undefined ? localPinnedPostId : pinnedPostId;
  const setPinnedPostId = onPinPost ?? ((postId: string | null) => {
    setLocalPinnedPostId(postId);
    window.dispatchEvent(new CustomEvent("debate:pin-post-card", { detail: postId }));
  });
  const isPinned = activePinnedPostId === post.id;
  const currentTrail = useMemo<BranchTrailItem[]>(() => [
    ...ancestorTrail,
    {
      id: post.id,
      relationType: post.relationType,
      label: isMainPost ? `${postRelationLabels.main}${String(index ?? 1).padStart(2, "0")}` : postRelationLabels[post.relationType],
      author: post.author,
      body: post.body,
    },
  ], [ancestorTrail, index, isMainPost, post.author, post.body, post.id, post.relationType]);
  const activeBranchTrail = pinnedBranchTrail.length > 0 ? pinnedBranchTrail : hoveredBranchTrail;

  useEffect(() => {
    if (!branchTrailRef.current || activeBranchTrail.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      if (branchTrailRef.current) branchTrailRef.current.scrollLeft = 0;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeBranchTrail]);

  useEffect(() => {
    if (depth !== 0) return;
    function syncPinnedCard(event: Event) {
      const postId = (event as CustomEvent<string | null>).detail;
      setLocalPinnedPostId(postId);
      if (postId === null) setPinnedBranchTrail([]);
    }
    window.addEventListener("debate:pin-post-card", syncPinnedCard);
    return () => window.removeEventListener("debate:pin-post-card", syncPinnedCard);
  }, [depth]);

  useEffect(() => {
    if (!isMainPost || !mainAnchorId) return;
    const syncHoveredBranchTrail = (event: Event) => {
      const detail = (event as CustomEvent<BranchTrailEventDetail>).detail;
      if (detail.mainAnchorId === mainAnchorId) setHoveredBranchTrail(detail.trail);
    };
    const syncPinnedBranchTrail = (event: Event) => {
      const detail = (event as CustomEvent<BranchTrailEventDetail>).detail;
      setPinnedBranchTrail(detail.mainAnchorId === mainAnchorId ? detail.trail : []);
    };
    window.addEventListener("debate:hover-branch-trail", syncHoveredBranchTrail);
    window.addEventListener("debate:pin-branch-trail", syncPinnedBranchTrail);
    return () => {
      window.removeEventListener("debate:hover-branch-trail", syncHoveredBranchTrail);
      window.removeEventListener("debate:pin-branch-trail", syncPinnedBranchTrail);
    };
  }, [isMainPost, mainAnchorId]);

  useEffect(() => {
    if (!stickyMain || !isMainPost || !stickySentinelRef.current) return;

    const mediaQuery = window.matchMedia("(min-width: 640px)");
    let observer: IntersectionObserver | null = null;

    const observeSentinel = () => {
      observer?.disconnect();
      const stickyTop = mediaQuery.matches ? 80 : 108;
      observer = new IntersectionObserver(([entry]) => {
        const sentinelTop = entry.boundingClientRect.top;
        publishCurrentMainPost(stickyTop);
      }, { rootMargin: `-${stickyTop}px 0px 0px 0px`, threshold: 0 });
      observer.observe(stickySentinelRef.current!);
    };

    observeSentinel();
    mediaQuery.addEventListener("change", observeSentinel);
    return () => {
      observer?.disconnect();
      mediaQuery.removeEventListener("change", observeSentinel);
    };
  }, [isMainPost, mainAnchorId, stickyMain]);

  useEffect(() => {
    if (!stickyMain || !isMainPost || !mainAnchorId) return;
    const syncCurrentMain = (event: Event) => {
      const activeMainPostId = (event as CustomEvent<string>).detail;
      const stickyTop = window.matchMedia("(min-width: 640px)").matches ? 80 : 108;
      const hasReachedSticky = (stickySentinelRef.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY) < stickyTop;
      setIsStickyMain(hasReachedSticky && activeMainPostId === post.id);
    };
    window.addEventListener("debate:active-main-post", syncCurrentMain);
    return () => window.removeEventListener("debate:active-main-post", syncCurrentMain);
  }, [isMainPost, mainAnchorId, post.id, stickyMain]);

  function togglePinned(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, label, form")) return;
    toggleCurrentPin();
  }

  function toggleCurrentPin() {
    const nextPostId = isPinned ? null : post.id;
    setPinnedPostId(nextPostId);
    if (mainAnchorId) {
      window.dispatchEvent(new CustomEvent<BranchTrailEventDetail>("debate:pin-branch-trail", {
        detail: { mainAnchorId, trail: nextPostId ? currentTrail : [] },
      }));
    }
  }

  function publishHoveredTrail(trail: BranchTrailItem[]) {
    if (!mainAnchorId) return;
    window.dispatchEvent(new CustomEvent<BranchTrailEventDetail>("debate:hover-branch-trail", {
      detail: { mainAnchorId, trail },
    }));
  }

  function pinCurrentTrail() {
    setPinnedPostId(post.id);
    if (!mainAnchorId) return;
    window.dispatchEvent(new CustomEvent<BranchTrailEventDetail>("debate:pin-branch-trail", {
      detail: { mainAnchorId, trail: currentTrail },
    }));
  }

  function handleReaction(reactionType: PostReactionType) {
    setReactionMessage("");
    if (!canReact) { setReactionMessage("評価するにはログインしてください。"); return; }
    const nextReaction = selectedReaction === reactionType ? null : reactionType;
    startReactionTransition(async () => {
      const result = await setDebatePostReaction(topicSlug, post.id, nextReaction);
      setReactionMessage(result.message);
      if (!result.success) {
        if (result.message.includes("懐疑")) router.refresh();
        return;
      }

      setReactionCounts((current) => current.map((reaction) => {
        if (reaction.count === null) return reaction;
        let count = reaction.count;
        if (reaction.type === selectedReaction) count = Math.max(0, count - 1);
        if (reaction.type === nextReaction) count += 1;
        return { ...reaction, count };
      }));
      setSelectedReaction(nextReaction ?? undefined);
    });
  }

  return (
    <section data-visual-depth={depth} data-supplement-continuation={followsSupplementAtSameDepth || undefined} className={isMainPost ? "relative" : `relative pl-[var(--tree-indent)] [--post-left-accent-center:1.5px] [--tree-dot-radius:3px] [--tree-elbow-y:1.875rem] [--tree-max-indent:2.25rem] [--tree-rail-center:1px] [--tree-rail-radius:1px] md:[--tree-max-indent:6.25rem] ${treeDimensions} ${replyWidthLayout}`}>
      {stickyMain && isMainPost && <span ref={stickySentinelRef} aria-hidden className="pointer-events-none absolute left-0 top-0 size-px" />}
      {!isMainPost && !followsSupplementAtSameDepth && (
        <>
          <span aria-hidden className="absolute left-0 top-[-0.5rem] h-[calc(var(--tree-elbow-y)+0.5rem+var(--tree-rail-radius))] w-[calc(var(--tree-indent)+var(--post-left-accent-center))] rounded-bl-md border-b-2 border-l-2 border-slate-400" />
          {!isLast && <span aria-hidden className="absolute bottom-[-0.8rem] left-0 top-[var(--tree-elbow-y)] w-0.5 bg-slate-400" />}
          <span aria-hidden className="absolute left-[calc(var(--tree-rail-center)-var(--tree-dot-radius))] top-[calc(var(--tree-elbow-y)-var(--tree-dot-radius))] z-10 size-1.5 rounded-full bg-slate-400" />
        </>
      )}

      <article id={`post-${post.id}`} data-testid="post-card" data-post-id={post.id} data-relation-type={post.relationType} data-sticky-main={stickyMain && isMainPost ? "true" : undefined} data-sticky-active={isStickyMain ? "true" : undefined} onMouseEnter={() => publishHoveredTrail(currentTrail)} onMouseLeave={() => publishHoveredTrail([])} onClick={togglePinned} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && event.target === event.currentTarget) { event.preventDefault(); toggleCurrentPin(); } }} tabIndex={0} aria-expanded={isPinned} className={isMainPost
        ? `group relative scroll-mt-44 overflow-hidden rounded-2xl border sm:scroll-mt-40 ${stickyMain ? "sticky top-[6.75rem] z-30 sm:top-20" : ""} ${isStickyMain ? "border-slate-300 px-2 py-1.5 shadow-md backdrop-blur-sm sm:px-4 sm:py-3" : "border-slate-200 px-3.5 py-5 shadow-sm sm:p-6"} ${factionTint} transition-[padding,box-shadow,border-color] duration-200`
        : `group relative scroll-mt-44 rounded-xl border border-l-[3px] border-slate-200 sm:scroll-mt-40 ${factionTint} px-2.5 py-4 shadow-[0_2px_10px_rgba(15,23,42,.04)] sm:p-5 ${relation?.card ?? "border-l-slate-300"}`
      }>
        {isMainPost && <div className="absolute inset-y-0 left-0 w-1 bg-blue-700" />}
        <header className={`flex flex-wrap items-center ${isStickyMain ? "gap-1.5" : "gap-2"}`}>
          {isMainPost && <span className="mr-1 rounded-md bg-slate-900 px-2.5 py-1 text-[10px] font-black tracking-wider text-white">本筋 {String(index ?? 1).padStart(2, "0")}</span>}
          {post.relation && relation && <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${relation.badge}`}><span aria-hidden>{relation.mark}</span>{post.relation}</span>}
          <span className={`${isMainPost ? "text-base" : "text-sm"} font-black text-slate-900`}>{post.author}</span>
          <FactionBadge name={post.faction} previousName={post.previousFaction} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs">
            <span title={reactionBreakdown} className={`rounded-full px-2.5 py-1 font-black ${evaluationScore > 0 ? "bg-blue-50 text-blue-700" : evaluationScore < 0 ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-600"}`}>評価 {evaluationScore > 0 ? `+${evaluationScore}` : evaluationScore}</span>
            <time className={`${isStickyMain ? "hidden sm:inline" : ""} font-medium text-slate-500`}>{post.date}</time>
          </div>
        </header>

        <p className={`${isStickyMain ? "mt-1.5 line-clamp-1 text-sm leading-6 [@media(max-height:600px)]:hidden" : "mt-3"} text-slate-700 ${isMainPost && !isStickyMain ? "text-[15px] leading-8 sm:text-base" : !isMainPost ? "text-sm leading-7" : ""}`}>{post.body}</p>

        {isMainPost && isStickyMain && <div className={`${activeBranchTrail.length > 0 ? "mt-1.5 h-7 sm:mt-2 sm:h-8" : "h-1"} transition-[height,margin] duration-150`}>
          {activeBranchTrail.length > 0 && <nav ref={branchTrailRef} data-testid="branch-trail" aria-label="注目中の返信経路" className="flex h-7 min-w-0 items-center gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap rounded-lg border border-slate-200/80 bg-white/75 px-2 text-[10px] shadow-sm backdrop-blur-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:h-8 sm:text-[11px]">
          {activeBranchTrail.map((item, itemIndex) => <span key={item.id} className="contents">
              {itemIndex > 0 && <span aria-hidden className="shrink-0 font-bold text-slate-400">→</span>}
              <button
                type="button"
                data-testid={`branch-trail-item-${item.id}`}
                title={`${item.label} / ${item.author}\n「${item.body.slice(0, 60)}${item.body.length > 60 ? "…" : ""}」`}
                onClick={(event) => {
                  event.stopPropagation();
                  document.getElementById(`post-${item.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`shrink-0 truncate rounded px-1 py-0.5 font-bold transition-colors hover:bg-white sm:max-w-40 ${branchTrailNodeClass(item.relationType)}`}
              >
                <span>{item.label}</span>
                <span className="hidden sm:inline"> {item.author}</span>
              </button>
            </span>)}
          </nav>}
        </div>}

        {!isStickyMain && <div className={`${isPinned || replyType ? "mt-3 grid-rows-[1fr] opacity-100 pointer-events-auto" : "grid-rows-[0fr] opacity-0 pointer-events-none group-hover:mt-3 group-hover:grid-rows-[1fr] group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:mt-3 group-focus-within:grid-rows-[1fr] group-focus-within:opacity-100 group-focus-within:pointer-events-auto"} grid transition-[grid-template-rows,opacity,margin] duration-200`}>
          <div className="min-h-0 overflow-hidden"><div className="rounded-xl border border-slate-200 bg-white p-3 shadow-md">
            <div className="flex flex-wrap items-center gap-2"><span className="mr-1 text-[10px] font-black tracking-wide text-slate-400">評価</span>{reactionCounts.filter((reaction) => allowSkepticalReaction || reaction.type !== "skeptical").map((reaction) => <button type="button" data-testid={`reaction-${reaction.type}`} key={reaction.type} onClick={() => handleReaction(reaction.type)} disabled={reactionPending} aria-pressed={selectedReaction === reaction.type} className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-60 ${selectedReaction === reaction.type ? "border-blue-300 bg-blue-100 text-blue-900 shadow-sm" : "border-slate-200 bg-slate-50 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-800"}`}>{reaction.label} <b>{reaction.count ?? "—"}</b></button>)}</div>
            {allowReplies && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-100 pt-2">{replyActions.map((action) => <button type="button" data-testid={`reply-action-${action.type}`} key={action.type} disabled={!canReply} onClick={() => { pinCurrentTrail(); setReplyType(action.type); }} title={canReply ? `${action.label}を書く` : replyDisabledReason ?? "返信するには討論への参加が必要です"} className="rounded-md border border-slate-200 bg-white/70 px-2 py-1 text-xs font-bold text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40">＋ {action.label}</button>)}</div>}
            {replyCount > 0 && showReplies && <button type="button" data-testid="replies-toggle" onClick={() => { setShowReplies(false); setPinnedPostId(null); }} aria-expanded="true" className="mt-2 ml-auto flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50"><span aria-hidden>△</span>返信 {replyCount}件</button>}
          </div></div>
        </div>}
        {reactionMessage && <p role="status" className={`mt-2 text-xs font-semibold ${reactionMessage.includes("しました") ? "text-emerald-700" : "text-rose-700"}`}>{reactionMessage}</p>}
        {!isStickyMain && allowReplies && replyType && canReply && <PostComposer slug={topicSlug} factions={postingFactions} primaryFactionId={primaryFactionId} allowFactionSelection={allowFactionSelection} parentPostId={post.id} relationType={replyType} compact onCancel={() => setReplyType(null)} onSuccess={() => setReplyType(null)} />}
      </article>

      {replyCount > 0 && !showReplies && <button type="button" data-testid="replies-toggle" onClick={() => setShowReplies(true)} aria-expanded="false" className={`${isMainPost ? "ml-2 sm:ml-4" : "ml-0.5 sm:ml-2"} mt-2 inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100`}><span aria-hidden>▽</span>返信 {replyCount}件</button>}

      {showReplies && visualReplies.length > 0 && (
        <div className={`${isMainPost ? "mt-4" : "mt-3"} relative space-y-3`}>
          {visualReplies.map((item) => {
            const connectorMetadata = {
              "data-branch-child-index": item.branchChildIndex ?? undefined,
              "data-branch-child-count": item.branchChildCount || undefined,
              "data-branch-position": item.isSupplementContinuationItem ? undefined : item.isBranchLast ? "end" : "middle",
              "data-continuation-before": item.showContinuationLineAbove || undefined,
              "data-continuation-after": item.showContinuationLineBelow || undefined,
            };
            return <div key={item.post.id} {...connectorMetadata} className="relative">
              {item.showContinuationLineAbove && <span aria-hidden className="pointer-events-none absolute -top-3 left-[calc(var(--tree-rail-center)-var(--tree-rail-radius))] z-0 h-3 w-0.5 bg-slate-400" />}
              {item.showContinuationLineBelow && <span aria-hidden className="pointer-events-none absolute -bottom-3 left-[calc(var(--tree-rail-center)-var(--tree-rail-radius))] top-0 z-0 w-0.5 bg-slate-400" />}
              <PostCard post={item.post} topicSlug={topicSlug} postingFactions={postingFactions} primaryFactionId={primaryFactionId} allowFactionSelection={allowFactionSelection} allowSkepticalReaction={allowSkepticalReaction} canReply={canReply} allowReplies={allowReplies} replyDisabledReason={replyDisabledReason} canReact={canReact} depth={item.isSupplementContinuationItem ? depth : depth + 1} isLast={item.isSupplementContinuationItem || item.isBranchLast} parentRelationTone={relationAppearance?.tone} parentRelationType={post.relationType} pinnedPostId={activePinnedPostId} onPinPost={setPinnedPostId} mainAnchorId={mainAnchorId} ancestorTrail={currentTrail} />
            </div>;
          })}
        </div>
      )}
    </section>
  );
}
