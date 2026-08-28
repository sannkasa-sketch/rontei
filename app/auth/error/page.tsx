import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "メール確認エラー", robots: { index: false, follow: false } };
export default function AuthErrorPage() { return <main className="page-shell flex flex-1 items-center justify-center py-20"><section className="panel max-w-lg p-8 text-center"><p className="text-xs font-black tracking-wider text-rose-600">AUTH ERROR</p><h1 className="mt-3 text-2xl font-black text-slate-950">メール確認に失敗しました</h1><p className="mt-4 text-sm leading-6 text-slate-600">リンクの有効期限が切れているか、すでに使用されている可能性があります。もう一度登録をお試しください。</p><Link href="/signup" className="button-primary mt-7">新規登録へ戻る</Link></section></main>; }
