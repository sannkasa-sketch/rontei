"use client";

import { useEffect, useState } from "react";

export type MainPostNavigationItem = {
  anchorId: string;
  postId: string;
  number: number;
};

type MarkerPosition = MainPostNavigationItem & { top: number };

export function MainPostNavigator({ items, timelineId }: { items: MainPostNavigationItem[]; timelineId: string }) {
  const [markers, setMarkers] = useState<MarkerPosition[]>(() => items.map((item, index) => ({
    ...item,
    top: items.length <= 1 ? 50 : (index / (items.length - 1)) * 100,
  })));
  const [activePostId, setActivePostId] = useState(items[0]?.postId ?? "");

  useEffect(() => {
    if (items.length < 2) return;

    const timeline = document.getElementById(timelineId);
    const elements = items
      .map((item) => document.getElementById(item.anchorId))
      .filter((element): element is HTMLElement => element !== null);
    if (!timeline || elements.length !== items.length) return;

    const updateMarkerPositions = () => {
      const timelineRect = timeline.getBoundingClientRect();
      const timelineHeight = Math.max(timelineRect.height, 1);
      const nextMarkers = items.map((item, index) => {
        const elementRect = elements[index].getBoundingClientRect();
        const offset = elementRect.top - timelineRect.top;
        return { ...item, top: Math.max(2, Math.min(98, (offset / timelineHeight) * 100)) };
      });
      const minimumGap = 5.5;
      for (let index = 1; index < nextMarkers.length; index += 1) nextMarkers[index].top = Math.max(nextMarkers[index].top, nextMarkers[index - 1].top + minimumGap);
      if (nextMarkers.at(-1)!.top > 98) {
        nextMarkers[nextMarkers.length - 1].top = 98;
        for (let index = nextMarkers.length - 2; index >= 0; index -= 1) nextMarkers[index].top = Math.min(nextMarkers[index].top, nextMarkers[index + 1].top - minimumGap);
      }
      setMarkers(nextMarkers);
    };

    updateMarkerPositions();
    const resizeObserver = new ResizeObserver(updateMarkerPositions);
    resizeObserver.observe(timeline);
    window.addEventListener("resize", updateMarkerPositions);

    const syncStickyMain = (event: Event) => {
      const postId = (event as CustomEvent<string>).detail;
      if (items.some((item) => item.postId === postId)) setActivePostId(postId);
    };
    window.addEventListener("debate:active-main-post", syncStickyMain);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", updateMarkerPositions);
      window.removeEventListener("debate:active-main-post", syncStickyMain);
    };
  }, [items, timelineId]);

  if (items.length < 2) return null;

  function jumpTo(marker: MarkerPosition) {
    document.getElementById(marker.anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav data-testid="main-post-navigator" data-active-main-post-id={activePostId} aria-label="本筋ナビゲーター" className="sticky top-24 h-[calc(100vh-18rem)] min-h-64 max-h-[30rem] w-11">
      <div className="absolute inset-y-2 left-3.5 w-px rounded-full bg-slate-300" aria-hidden="true" />
      {markers.map((marker) => {
        const active = marker.postId === activePostId;
        const number = String(marker.number).padStart(2, "0");
        return (
          <button
            key={marker.anchorId}
            type="button"
            data-testid={`main-post-nav-marker-${number}`}
            data-main-post-id={marker.postId}
            aria-label={`本筋${number}へ移動`}
            aria-current={active ? "location" : undefined}
            title={`本筋${number}`}
            onClick={() => jumpTo(marker)}
            className="group absolute left-0 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            style={{ top: `${marker.top}%` }}
          >
            <span className={`block rounded-full border-2 transition-colors ${active ? "size-3 border-blue-700 bg-blue-700" : "size-2 border-slate-400 bg-white group-hover:border-blue-500 group-hover:bg-blue-100"}`} />
            {active && <span className="absolute left-7 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-800">{number}</span>}
          </button>
        );
      })}
    </nav>
  );
}
