import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AuthCard } from "@/components/AuthCard";
import { UpdatePasswordForm } from "@/components/UpdatePasswordForm";
import { RECOVERY_COOKIE_NAME, verifyRecoveryMarker } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "新しいパスワード", robots: { index: false, follow: false } };

export default async function UpdatePasswordPage() {
  const cookieStore = await cookies();
  const marker = cookieStore.get(RECOVERY_COOKIE_NAME)?.value;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const currentUserId = data?.claims?.sub;
  const canResetPassword = typeof currentUserId === "string" && verifyRecoveryMarker(marker, currentUserId);

  if (!canResetPassword) {
    return <AuthCard title="再設定リンクが必要です" description="パスワード再設定メールのリンクからアクセスしてください。" footer={<Link href="/login" className="font-bold text-blue-700 hover:text-blue-900">ログインへ戻る</Link>}><div className="space-y-4 text-sm leading-6 text-slate-600"><p>この画面を利用するには、有効な再設定手続きが必要です。</p><Link href="/forgot-password" className="button-primary w-full">再設定メールを送る</Link></div></AuthCard>;
  }

  return <AuthCard title="新しいパスワード" description="今後のログインに使用するパスワードを設定してください。" footer={<span className="text-slate-500">8文字以上で入力してください。</span>}><UpdatePasswordForm /></AuthCard>;
}
