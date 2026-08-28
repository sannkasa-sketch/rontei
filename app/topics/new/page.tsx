import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreateTopicForm } from "@/components/CreateTopicForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "議題を作成", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function NewTopicPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  return <main><div className="border-b border-slate-200 bg-white"><div className="page-shell py-10 sm:py-14"><p className="section-kicker">CREATE TOPIC</p><h1 className="section-title">議題を作る</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">話したいテーマと、討論のルールを設定します。</p></div></div><div className="page-shell max-w-6xl py-10 sm:py-14"><CreateTopicForm /></div></main>;
}
