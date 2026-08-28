import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/Header";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteDescription = "違いが芽吹く、対話の庭。論点を枝分かれで整理しながら対話できる討論プラットフォームです。";
export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: "論庭", template: "%s | 論庭" },
  description: siteDescription,
  openGraph: { type: "website", siteName: "論庭", title: "論庭", description: siteDescription },
};
export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="ja"><body><Header />{children}<footer className="mt-auto border-t border-slate-200 bg-white"><div className="page-shell flex flex-col gap-4 py-7 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-col gap-1.5"><Link href="/" aria-label="論庭 ホーム" className="w-fit font-black tracking-[0.12em] text-slate-800 hover:text-blue-700">論庭</Link><span>違いが芽吹く、対話の庭。</span></div><nav aria-label="法的情報" className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold"><Link href="/terms" className="hover:text-blue-700">利用規約</Link><Link href="/privacy" className="hover:text-blue-700">プライバシーポリシー</Link></nav></div></footer></body></html>;
}
