"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AccountNameResult = { success: boolean; message: string };

export async function saveAccountName(accountName: string): Promise<AccountNameResult> {
  const name = accountName.trim();
  if (name.length < 2 || name.length > 30) return { success: false, message: "アカウント名は2〜30文字で入力してください。" };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return { success: false, message: "ログイン状態を確認できませんでした。再度ログインしてください。" };

  const { data: updatedProfile, error } = await supabase
    .from("profiles")
    .update({ account_name: name })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error?.code === "23505") return { success: false, message: "そのアカウント名はすでに使用されています。" };
  if (error) return { success: false, message: "アカウント名を保存できませんでした。" };
  if (!updatedProfile) return { success: false, message: "プロフィールを更新する権限がありません。" };
  return { success: true, message: "アカウント名を保存しました。" };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
