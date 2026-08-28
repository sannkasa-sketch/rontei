import Link from "next/link";
import type { ReactNode } from "react";

export function AuthCard({ title, description, children, footer }: { title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <main className="page-shell flex flex-1 items-start justify-center py-8 sm:py-10">
      <section className="panel w-full max-w-[460px] p-5 sm:p-7">
        <Link href="/" aria-label="論庭 ホームへ" className="inline-flex text-sm font-black tracking-[0.12em] text-slate-900">論庭</Link>
        <div className="mt-5 border-b border-slate-100 pb-5"><h1 className="text-2xl font-black tracking-tight text-slate-950">{title}</h1><p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p></div>
        <div className="mt-5">{children}</div>
        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-sm leading-6 text-slate-600">{footer}</div>
      </section>
    </main>
  );
}
