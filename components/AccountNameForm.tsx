"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveAccountName } from "@/app/mypage/actions";

export function AccountNameForm({ currentName = "" }: { currentName?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("accountName") ?? "");
    startTransition(async () => {
      const result = await saveAccountName(name);
      setMessage(result.message);
      setSuccess(result.success);
      if (result.success) router.refresh();
    });
  }

  return <form onSubmit={submit} className="mt-5"><label htmlFor="accountName" className="block text-sm font-bold text-slate-700">アカウント名</label><div className="mt-2 flex flex-col gap-3 sm:flex-row"><input id="accountName" name="accountName" defaultValue={currentName} minLength={2} maxLength={30} required className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-300 px-3" placeholder="2〜30文字" /><button disabled={pending} className="button-primary shrink-0 disabled:opacity-60">{pending ? "保存中…" : "保存"}</button></div>{message && <p role="status" className={`mt-3 text-sm font-semibold ${success ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}</form>;
}
