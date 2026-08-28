"use client";

import { useEffect, useState } from "react";
import { getTopicRemainingTime } from "@/lib/topic-remaining-time";

const urgencyStyles = {
  normal: "text-slate-500",
  soon: "font-semibold text-amber-700",
  imminent: "font-bold text-orange-700",
  ended: "font-semibold text-slate-400",
};

const pillUrgencyStyles = {
  normal: "border-slate-200 bg-white/70 text-slate-600",
  soon: "border-amber-200 bg-amber-50/80 font-semibold text-amber-700",
  imminent: "border-orange-200 bg-orange-50/90 font-bold text-orange-700",
  ended: "border-slate-200 bg-slate-100/80 font-semibold text-slate-500",
};

export function TopicRemainingTime({ endsAt, isEnded = false, referenceNow, className = "", variant = "text" }: {
  endsAt?: string | null;
  isEnded?: boolean;
  referenceNow: string;
  className?: string;
  variant?: "text" | "pill";
}) {
  const initialNow = Date.parse(referenceNow);
  const [nowMs, setNowMs] = useState(Number.isFinite(initialNow) ? initialNow : 0);

  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const remaining = getTopicRemainingTime(endsAt, nowMs, isEnded);
  const style = variant === "pill" ? `inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${pillUrgencyStyles[remaining.urgency]}` : urgencyStyles[remaining.urgency];
  return <span data-testid="topic-remaining-time" className={`${style} ${className}`.trim()}>{remaining.label}</span>;
}
