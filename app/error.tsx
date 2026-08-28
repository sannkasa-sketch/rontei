"use client";

import Link from "next/link";

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="page-shell flex flex-1 items-center justify-center py-16 sm:py-24"><section className="panel w-full max-w-xl p-7 text-center sm:p-10" role="alert"><p className="section-kicker">ERROR</p><h1 className="text-2xl font-black text-slate-950">ページを読み込めませんでした</h1><p className="mt-3 text-sm leading-7 text-slate-600">一時的な問題の可能性があります。もう一度お試しください。</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => retry()} className="button-primary">再試行</button><Link href="/" className="button-secondary">ホームへ戻る</Link></div></section></main>;
}
