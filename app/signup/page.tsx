import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { SignupForm } from "@/components/SignupForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "新規登録", robots: { index: false, follow: false } };

export default async function SignupPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/mypage");
  return <AuthCard title="新規登録" description="論庭を利用するためのアカウントを作成します。" footer={<>すでにアカウントをお持ちの場合は <Link href="/login" className="font-bold text-blue-700 hover:text-blue-900">ログイン</Link></>}><SignupForm /></AuthCard>;
}
