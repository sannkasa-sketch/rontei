"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type FieldErrors = { password?: string; confirmation?: string };
const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function UpdatePasswordForm() {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const nextErrors: FieldErrors = {};
    if (!password) nextErrors.password = "新しいパスワードを入力してください。";
    else if (password.length < 8) nextErrors.password = "パスワードは8文字以上で入力してください。";
    if (!confirmation) nextErrors.confirmation = "確認用パスワードを入力してください。";
    else if (password !== confirmation) nextErrors.confirmation = "パスワードが一致しません。";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setPending(true);
    const { error: authError } = await createClient().auth.updateUser({ password });
    if (authError) {
      setError("パスワードを更新できませんでした。再設定用メールからもう一度お試しください。");
      setPending(false);
      return;
    }
    try {
      await fetch("/account/update-password/complete", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // The signed marker expires independently after 15 minutes.
    }
    setSuccess(true);
    setPending(false);
  }

  if (success) {
    return <div role="status" data-testid="password-update-success" className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-3 text-sm font-semibold leading-6 text-emerald-700"><p>パスワードを更新しました。</p><Link href="/mypage" className="mt-2 inline-flex font-black text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900">マイページへ</Link></div>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div><label htmlFor="new-password" className="block text-sm font-bold text-slate-700">新しいパスワード</label><input id="new-password" name="password" type="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? "new-password-error" : undefined} className={inputClass} />{fieldErrors.password && <p id="new-password-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors.password}</p>}</div>
      <div><label htmlFor="new-password-confirmation" className="block text-sm font-bold text-slate-700">新しいパスワード確認</label><input id="new-password-confirmation" name="confirmation" type="password" autoComplete="new-password" aria-invalid={Boolean(fieldErrors.confirmation)} aria-describedby={fieldErrors.confirmation ? "new-password-confirmation-error" : undefined} className={inputClass} />{fieldErrors.confirmation && <p id="new-password-confirmation-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors.confirmation}</p>}</div>
      {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
      <button type="submit" data-testid="update-password-submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{pending ? "更新しています…" : "パスワードを更新"}</button>
    </form>
  );
}
