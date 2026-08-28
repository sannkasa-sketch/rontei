import { formatFactionEventDate, type FactionChangeEvent } from "@/lib/faction-events";

export function FactionChangeEventCard({ event }: { event: FactionChangeEvent }) {
  return <article data-testid="faction-change-event" className="mx-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4 sm:mx-6 sm:px-5">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="text-sm font-semibold text-slate-700"><b className="text-slate-900">{event.display_name}</b> さんが派閥を移動しました</p>
      <time className="text-xs text-slate-400 sm:ml-auto">{formatFactionEventDate(event.moved_at)}</time>
    </div>
    <p className="mt-2 text-sm font-black text-slate-800"><span>{event.from_faction_name}</span><span className="mx-2 text-slate-400">→</span><span>{event.to_faction_name}</span></p>
  </article>;
}
