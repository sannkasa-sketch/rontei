import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { LoginForm } from "@/components/LoginForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ログイン", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/mypage");
  return <AuthCard title="ログイン" description="論庭にログインします。" footer={<>アカウントをお持ちでない場合は <Link href="/signup" className="font-bold text-blue-700 hover:text-blue-900">新規登録</Link></>}><LoginForm /></AuthCard>;
}
