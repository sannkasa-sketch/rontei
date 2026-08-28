import Link from "next/link";

export default function NotFound() {
  return <main className="page-shell flex flex-1 items-center justify-center py-16 sm:py-24"><section className="panel w-full max-w-xl p-7 text-center sm:p-10"><p className="text-sm font-black tracking-[0.22em] text-blue-700">404</p><h1 className="mt-3 text-2xl font-black text-slate-950 sm:text-3xl">ページが見つかりません</h1><p className="mx-auto mt-3 max-w-md text-sm leading-7 text-slate-600">URLが変更されたか、ページが削除された可能性があります。</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/" className="button-primary">ホームへ戻る</Link><Link href="/topics" className="button-secondary">議題を探す</Link></div></section></main>;
}
