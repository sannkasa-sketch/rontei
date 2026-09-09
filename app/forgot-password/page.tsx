import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";

export const metadata: Metadata = { title: "パスワード再設定", robots: { index: false, follow: false } };

export default function ForgotPasswordPage() {
  return <AuthCard title="パスワード再設定" description="登録したメールアドレスへ再設定用の案内を送ります。" footer={<Link href="/login" className="font-bold text-blue-700 hover:text-blue-900">ログインへ戻る</Link>}><ForgotPasswordForm /></AuthCard>;
}
