"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/TurnstileWidget";

type FieldErrors = { email?: string; password?: string };
const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function LoginForm() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const nextErrors: FieldErrors = {};
    if (!email) nextErrors.email = "メールアドレスを入力してください。";
    if (!password) nextErrors.password = "パスワードを入力してください。";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!turnstileToken) {
      setError("セキュリティ確認を完了してください。");
      return;
    }
    setPending(true);
    const { error: authError } = await createClient().auth.signInWithPassword({ email, password, options: { captchaToken: turnstileToken } });
    if (authError) {
      const normalizedError = authError.message.toLowerCase();
      setError(normalizedError.includes("captcha") || normalizedError.includes("turnstile") || normalizedError.includes("challenge")
        ? "セキュリティ確認に失敗しました。もう一度お試しください。"
        : "メールアドレスまたはパスワードを確認してください。");
      turnstileRef.current?.reset();
      setPending(false);
      return;
    }
    router.push("/mypage");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div><label htmlFor="login-email" className="block text-sm font-bold text-slate-700">メールアドレス</label><input id="login-email" name="email" data-testid="login-email" type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "login-email-error" : undefined} className={inputClass} />{fieldErrors.email && <p id="login-email-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors.email}</p>}</div>
      <div><label htmlFor="login-password" className="block text-sm font-bold text-slate-700">パスワード</label><div className="relative mt-2"><input id="login-password" name="password" data-testid="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "login-password-error" : undefined} className={`${inputClass} mt-0 pr-16`} /><button type="button" aria-label={showPassword ? "パスワードを非表示にする" : "パスワードを表示する"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-bold text-slate-600 hover:bg-slate-100">{showPassword ? "非表示" : "表示"}</button></div>{fieldErrors.password && <p id="login-password-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors.password}</p>}</div>
      <TurnstileWidget ref={turnstileRef} onTokenChange={setTurnstileToken} />
      {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
      <button type="submit" data-testid="login-submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{pending ? "ログインしています…" : "ログイン"}</button>
    </form>
  );
}
