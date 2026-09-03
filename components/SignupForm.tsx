"use client";

import Link from "next/link";
import { useRef, useState, type FocusEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/TurnstileWidget";

type FieldName = "accountName" | "email" | "password" | "confirmation";
type FieldErrors = Partial<Record<FieldName, string>>;
type NameAvailability = "idle" | "checking" | "available" | "unavailable";
const inputClass = "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal text-slate-950 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

function getSignupError(message: string) {
  const value = message.toLowerCase();
  if (value.includes("account_name") || value.includes("account name") || value.includes("profiles_account_name")) return "このアカウント名はすでに使用されています。";
  if (value.includes("already registered") || value.includes("already been registered") || (value.includes("email") && value.includes("unique"))) return "このメールアドレスはすでに登録されています。";
  if (value.includes("password") || value.includes("weak")) return "パスワードは6文字以上で入力してください。";
  return "処理中にエラーが発生しました。もう一度お試しください。";
}

export function SignupForm() {
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [nameAvailability, setNameAvailability] = useState<NameAvailability>("idle");
  const availabilityRequest = useRef(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  async function checkAccountName(rawName: string, showRequestError = true) {
    const accountName = rawName.trim();
    if (accountName.length < 2 || accountName.length > 30) {
      setNameAvailability("idle");
      return false;
    }

    const requestId = ++availabilityRequest.current;
    setNameAvailability("checking");
    const { data, error: availabilityError } = await createClient().rpc("is_account_name_available", { p_account_name: accountName });
    if (requestId !== availabilityRequest.current) return null;
    if (availabilityError) {
      setNameAvailability("idle");
      if (showRequestError) setError("アカウント名を確認できませんでした。時間をおいて再度お試しください。");
      return null;
    }

    const available = data === true;
    setNameAvailability(available ? "available" : "unavailable");
    setFieldErrors((current) => ({
      ...current,
      accountName: available ? undefined : "このアカウント名はすでに使用されています。",
    }));
    return available;
  }

  function handleAccountNameChange() {
    availabilityRequest.current += 1;
    setNameAvailability("idle");
    setFieldErrors((current) => ({ ...current, accountName: undefined }));
  }

  function handleAccountNameBlur(event: FocusEvent<HTMLInputElement>) {
    void checkAccountName(event.currentTarget.value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const emailInput = formElement.elements.namedItem("email");
    const accountName = String(form.get("accountName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    const nextErrors: FieldErrors = {};
    if (!accountName) nextErrors.accountName = "アカウント名を入力してください。";
    else if (accountName.length < 2 || accountName.length > 30) nextErrors.accountName = "アカウント名は2〜30文字で入力してください。";
    if (!email) nextErrors.email = "メールアドレスを入力してください。";
    else if (emailInput instanceof HTMLInputElement && emailInput.validity.typeMismatch) nextErrors.email = "正しい形式のメールアドレスを入力してください。";
    if (!password) nextErrors.password = "パスワードを入力してください。";
    else if (password.length < 6) nextErrors.password = "パスワードは6文字以上で入力してください。";
    if (!confirmation) nextErrors.confirmation = "確認用パスワードを入力してください。";
    else if (password !== confirmation) nextErrors.confirmation = "パスワードが一致しません。";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    if (!turnstileToken) {
      setError("セキュリティ確認を完了してください。");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const available = await checkAccountName(accountName);
    if (available !== true) {
      setPending(false);
      return;
    }
    const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/confirm`, data: { account_name: accountName }, captchaToken: turnstileToken } });
    if (authError) {
      const normalizedError = authError.message.toLowerCase();
      if (normalizedError.includes("captcha") || normalizedError.includes("turnstile") || normalizedError.includes("challenge")) {
        setError("セキュリティ確認に失敗しました。もう一度お試しください。");
      } else if (normalizedError.includes("database error") || normalizedError.includes("saving new user")) {
        const stillAvailable = await checkAccountName(accountName, false);
        setError(stillAvailable === false ? "このアカウント名はすでに使用されています。" : getSignupError(authError.message));
      } else {
        setError(getSignupError(authError.message));
      }
      turnstileRef.current?.reset();
      setPending(false);
      return;
    }
    if (data.session && data.user) {
      router.push("/mypage");
      router.refresh();
      return;
    }
    setMessage("登録手続きを受け付けました。未登録のメールアドレスの場合は、確認メールを送信しました。すでにアカウントをお持ちの場合は、ログインしてください。");
    setPending(false);
  }

  function passwordField(name: "password" | "confirmation", label: string, visible: boolean, toggle: () => void) {
    const errorId = `signup-${name}-error`;
    return <div><label htmlFor={`signup-${name}`} className="block text-sm font-bold text-slate-700">{label}</label><div className="relative mt-2"><input id={`signup-${name}`} name={name} type={visible ? "text" : "password"} autoComplete="new-password" aria-invalid={Boolean(fieldErrors[name])} aria-describedby={fieldErrors[name] ? errorId : undefined} className={`${inputClass} mt-0 pr-16`} /><button type="button" aria-label={visible ? `${label}を非表示にする` : `${label}を表示する`} aria-pressed={visible} onClick={toggle} className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-bold text-slate-600 hover:bg-slate-100">{visible ? "非表示" : "表示"}</button></div>{fieldErrors[name] && <p id={errorId} role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors[name]}</p>}</div>;
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div><label htmlFor="signup-account-name" className="block text-sm font-bold text-slate-700">アカウント名</label><input id="signup-account-name" name="accountName" autoComplete="nickname" onChange={handleAccountNameChange} onBlur={handleAccountNameBlur} aria-invalid={Boolean(fieldErrors.accountName)} aria-describedby="signup-account-name-help signup-account-name-status signup-account-name-error" className={inputClass} /><p id="signup-account-name-help" className="mt-1.5 text-xs leading-5 text-slate-500">完全記名の討論ではこの名前が表示されます。登録後は変更できません。</p>{nameAvailability === "checking" && <p id="signup-account-name-status" role="status" className="mt-1.5 text-sm font-semibold text-slate-500">使用可否を確認しています…</p>}{nameAvailability === "available" && <p id="signup-account-name-status" role="status" className="mt-1.5 text-sm font-semibold text-emerald-700">このアカウント名は使用できます。</p>}{fieldErrors.accountName && <p id="signup-account-name-error" role="alert" className="mt-1.5 text-sm font-semibold text-rose-700">{fieldErrors.accountName}</p>}</div>
      <div><label htmlFor="signup-email" className="block text-sm font-bold text-slate-700">メールアドレス</label><input id="signup-email" name="email" type="email" autoComplete="email" aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "signup-email-error" : undefined} className={inputClass} />{fieldErrors.email && <p id="signup-email-error" role="alert" className="mt-2 text-sm font-semibold text-rose-700">{fieldErrors.email}</p>}</div>
      {passwordField("password", "パスワード", showPassword, () => setShowPassword((value) => !value))}
      {passwordField("confirmation", "パスワード確認", showConfirmation, () => setShowConfirmation((value) => !value))}
      <TurnstileWidget ref={turnstileRef} onTokenChange={setTurnstileToken} />
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">討論ごとの発言名は、議題の設定によって別に設定できます。</p>
      {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700">{error}</p>}
      {message && <div role="status" data-testid="signup-success" className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm font-semibold leading-6 text-emerald-700"><p>{message}</p><Link href="/login" className="mt-2 inline-flex font-black text-blue-700 underline decoration-blue-300 underline-offset-4 hover:text-blue-900">ログインする</Link></div>}
      <button type="submit" disabled={pending} className="button-primary w-full disabled:cursor-wait disabled:opacity-60">{pending ? "作成しています…" : "アカウントを作成"}</button>
    </form>
  );
}
