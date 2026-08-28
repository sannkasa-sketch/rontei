import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/SiteNav";

const baseNav = [
  { href: "/", label: "ホーム" },
  { href: "/topics", label: "議題一覧" },
  { href: "/records", label: "議事録" },
];

export async function Header() {
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    signedIn = !error && Boolean(data?.claims?.sub);
  } catch {
    signedIn = false;
  }

  const nav = [...baseNav, { href: signedIn ? "/mypage" : "/login", label: signedIn ? "マイページ" : "ログイン" }];

  return <header className="sticky top-0 z-50 border-b border-slate-200/90 bg-white/95 backdrop-blur"><div className="page-shell flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"><Link href="/" aria-label="論庭 ホーム" className="text-xl font-[900] leading-none tracking-[0.08em] text-slate-950">論庭</Link><SiteNav items={nav} /></div></header>;
}
