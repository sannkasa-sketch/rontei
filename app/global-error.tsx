"use client";

import "./globals.css";

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <html lang="ja"><body><main className="page-shell flex min-h-screen items-center justify-center py-16"><section className="panel w-full max-w-xl p-8 text-center" role="alert"><p className="section-kicker">ERROR</p><h1 className="text-2xl font-black text-slate-950">ページを読み込めませんでした</h1><p className="mt-3 text-sm text-slate-600">もう一度お試しください。</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => retry()} className="button-primary">再試行</button><a href="/" className="button-secondary">ホームへ戻る</a></div></section></main></body></html>;
}
