"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SiteNavItem = { href: string; label: string };

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteNav({ items }: { items: SiteNavItem[] }) {
  const pathname = usePathname();
  return <nav aria-label="メインナビゲーション" className="order-3 -mx-1 flex w-[calc(100%+0.5rem)] flex-wrap items-center gap-1 sm:order-none sm:w-auto sm:flex-nowrap">{items.map((item) => { const active = isActivePath(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`relative shrink-0 rounded-md px-2.5 py-2 text-sm font-semibold hover:bg-slate-100 hover:text-slate-950 sm:px-3 ${active ? "text-slate-950 after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-blue-600" : "text-slate-600"}`}>{item.label}</Link>; })}</nav>;
}
