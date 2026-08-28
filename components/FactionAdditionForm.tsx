"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addTopicFaction } from "@/app/topics/actions";

export function FactionAdditionForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setMessage("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 30) {
      setSuccess(false);
      setMessage("派閥名は1〜30文字で入力してください。");
      return;
    }

    startTransition(async () => {
      const result = await addTopicFaction(slug, trimmedName);
      setSuccess(result.success);
      setMessage(result.message);
      if (result.success) {
        setOpen(false);
        setName("");
        router.refresh();
      } else if (result.message.includes("終了") || result.message.includes("許可") || result.message.includes("参加")) {
        router.refresh();
      }
    });
  }

  if (!open) return <div className="mt-4"><button type="button" onClick={() => { setOpen(true); setMessage(""); }} className="text-xs font-bold text-blue-700 hover:text-blue-900">＋ 派閥を追加</button>{message && <p role="status" className={`mt-2 text-xs font-semibold ${success ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}</div>;

  return <form onSubmit={submit} className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <label className="block text-xs font-bold text-slate-700">新しい派閥<input value={name} onChange={(event) => { setName(event.target.value); setMessage(""); }} minLength={1} maxLength={30} required placeholder="中立派" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm font-normal" /></label>
    <div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-slate-400">{name.length} / 30</span><div className="flex gap-2"><button type="button" onClick={close} disabled={pending} className="button-secondary !min-h-9 !px-3 !py-2">キャンセル</button><button type="submit" disabled={pending || name.trim().length === 0} className="button-primary !min-h-9 !px-3 !py-2 disabled:opacity-50">{pending ? "追加中…" : "追加する"}</button></div></div>
    {message && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{message}</p>}
  </form>;
}
