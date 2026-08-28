import type { ReactNode } from "react";

// TODO: 正式公開前に運営者が全文と未確定項目を確認し、必要に応じて専門家の確認を受けること。
export function LegalDocument({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="flex-1">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="mb-3 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold tracking-[0.08em] text-amber-800">公開前ドラフト</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
      </div>
    </header>
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-[15px] leading-8 text-slate-700 sm:px-6 sm:py-14 sm:text-base">
      <div className="mb-10 border-l-4 border-blue-300 bg-blue-50/70 px-4 py-3 text-sm leading-7 text-slate-700">
        本文書は公開前のドラフトです。正式公開時に内容、運営者情報、制定日等を確定します。
      </div>
      <div className="space-y-11 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:text-slate-950 [&_li]:pl-1 [&_ol]:ml-6 [&_ol]:list-decimal [&_p+p]:mt-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
      <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">制定日：[正式公開時に制定日を設定]</p>
    </article>
  </main>;
}
