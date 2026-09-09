"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/TurnstileWidget";
import { createClient } from "@/lib/supabase/client";

const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function ForgotPasswordForm() {
  const [emailError, setEmailError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError("");
    setError("");
    setMessage("");
    const form = event.currentTarget;
    const emailInput = form.elements.namedItem("email");
    const email = String(new FormData(form).get("email") ?? "").trim();
    if (!email) {
      setEmailError("メールアドレスを入力してください。");
      return;
    }
    if (emailInput instanceof HTMLInputElement && emailInput.validity.typeMismatch) {
      setEmailError("正しい形式のメールアドレスを入力してください。");
      return;
    }
    if (!turnstileToken) {
      setError("セキュリティ確認を完了してください。");
      return;
    }

    setPending(true);
    const { error: authError } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
      captchaToken: turnstileToken,
    });
    if (authError) {
      const value = authError.message.toLowerCase();
      setError(value.includes("captcha") || value.includes("turnstile") || value.includes("challenge")
        ? "セキュリティ確認に失敗しました。もう一度お試しください。"
        : "パスワード再設定の手続きを受け付けられませんでした。時間をおいてもう一度お試しください。");
      turnstileRef.current?.reset();
      setPending(false);
      return;
    }

    setMessage("パスワード再設定の手続きを受け付けました。登録済みのメールアドレスの場合は、再設定用メールを送信しました。");
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div>
        <label htmlFor="forgot-password-email" className="block text-sm font-bold text-slate-700">メールアドレス</label>
        <input id="forgot-password-email" name="email" type="email" autoComplete="email" aria-invalid={Boolean(emailError)} aria-describedby={emailError ? "forgot-password-email-error" : undefined} className={inputClass} />
        {emailError && <p id="forgot-password-email-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{emailError}</p>}
      </div>
      <TurnstileWidget ref={turnstileRef} onTokenChange={setTurnstileToken} />
      {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
      {message && <div role="status" data-testid="recovery-request-success" className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm font-semibold leading-6 text-emerald-700"><p>{message}</p><Link href="/login" className="mt-2 inline-flex font-black text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900">ログインへ戻る</Link></div>}
      <button type="submit" data-testid="forgot-password-submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{pending ? "送信しています…" : "再設定メールを送る"}</button>
    </form>
  );
}
