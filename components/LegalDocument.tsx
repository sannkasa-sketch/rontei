import type { ReactNode } from "react";
import { LEGAL_EFFECTIVE_DATE } from "@/lib/legal";

export function LegalDocument({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="flex-1">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{description}</p>
      </div>
    </header>
    <article className="mx-auto w-full max-w-3xl px-4 py-10 text-[15px] leading-8 text-slate-700 sm:px-6 sm:py-14 sm:text-base">
      <div className="space-y-11 [&_h2]:mb-4 [&_h2]:text-xl [&_h2]:font-black [&_h2]:tracking-tight [&_h2]:text-slate-950 [&_li]:pl-1 [&_ol]:ml-6 [&_ol]:list-decimal [&_p+p]:mt-3 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:space-y-1.5">
        {children}
      </div>
      {LEGAL_EFFECTIVE_DATE ? <p className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">制定日：{LEGAL_EFFECTIVE_DATE}</p> : null}
    </article>
  </main>;
}
