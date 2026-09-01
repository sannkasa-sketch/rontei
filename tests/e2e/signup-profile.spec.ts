import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const appEnvironment = parseEnv(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
const supabaseUrl = appEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = appEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

test("未使用名を確認して登録し、使用済み名とDB競合を拒否する", async ({ browser, page }) => {
  test.skip(!supabaseUrl || !supabaseKey, "Supabase公開設定が必要です");

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const accountName = `E2E登録${unique.slice(-6)}`;
  const email = `e2e-signup-${unique}@example.com`;
  const password = `E2E-signup-${unique}!`;

  await page.goto("/signup");
  await page.getByLabel("アカウント名", { exact: true }).fill(`  ${accountName}  `);
  await page.getByLabel("アカウント名", { exact: true }).blur();
  await expect(page.getByText("このアカウント名は使用できます。")).toBeVisible();
  await page.getByLabel("メールアドレス", { exact: true }).fill(email);
  await page.getByLabel("パスワード", { exact: true }).fill(password);
  await page.getByLabel("パスワード確認", { exact: true }).fill(password);

  const signupResponsePromise = page.waitForResponse(
    (response) => response.url().includes("/auth/v1/signup") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  const signupResponse = await signupResponsePromise;
  expect(signupResponse.ok()).toBe(true);
  const signupBody = await signupResponse.json() as { access_token?: string | null };

  // With confirmation disabled Supabase returns a session and the app opens
  // mypage immediately. With confirmation enabled it returns no session and the
  // app stays on signup. Profile creation must already be complete in both cases.
  if (signupBody.access_token) {
    await expect(page).toHaveURL(/\/mypage$/);
    await expect(page.getByText(accountName, { exact: true }).first()).toBeVisible();
  } else {
    await expect(page).toHaveURL(/\/signup$/);
    await expect(page.getByRole("status")).toContainText("確認メール");
  }

  const anon = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
  await expect.poll(async () => {
    const result = await anon.from("profiles").select("account_name").eq("account_name", accountName);
    expect(result.error).toBeNull();
    return result.data?.length ?? 0;
  }).toBe(1);

  // A second Auth INSERT with the same name must still be rejected by the
  // existing profiles_account_name_key unique constraint.
  const duplicate = await anon.auth.signUp({
    email: `e2e-signup-duplicate-${unique}@example.com`,
    password,
    options: { data: { account_name: accountName } },
  });
  expect(duplicate.error).not.toBeNull();

  const profileCount = await anon.from("profiles").select("id", { count: "exact", head: true }).eq("account_name", accountName);
  expect(profileCount.error).toBeNull();
  expect(profileCount.count).toBe(1);

  const duplicateContext = await browser.newContext({ baseURL: "http://localhost:3000" });
  const duplicatePage = await duplicateContext.newPage();
  await duplicatePage.goto("/signup");
  await duplicatePage.getByLabel("アカウント名", { exact: true }).fill(accountName);
  await duplicatePage.getByLabel("アカウント名", { exact: true }).blur();
  await expect(duplicatePage.getByText("このアカウント名はすでに使用されています。")).toBeVisible();
  await duplicatePage.getByLabel("メールアドレス", { exact: true }).fill(`e2e-signup-ui-duplicate-${unique}@example.com`);
  await duplicatePage.getByLabel("パスワード", { exact: true }).fill(password);
  await duplicatePage.getByLabel("パスワード確認", { exact: true }).fill(password);
  await duplicatePage.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(duplicatePage.getByText("このアカウント名はすでに使用されています。")).toBeVisible();
  await expect(duplicatePage).toHaveURL(/\/signup$/);
  await duplicateContext.close();
});

test("登録後はマイページとSupabase clientの両方からアカウント名を変更できない", async ({ page }) => {
  test.skip(!supabaseUrl || !supabaseKey, "Supabase公開設定が必要です");
  const email = process.env.E2E_USER1_EMAIL;
  const password = process.env.E2E_USER1_PASSWORD;
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);
  await expect(page.getByRole("textbox", { name: "アカウント名" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存" })).toHaveCount(0);

  const authenticated = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
  const signIn = await authenticated.auth.signInWithPassword({ email: email!, password: password! });
  expect(signIn.error).toBeNull();
  const userId = signIn.data.user!.id;
  const before = await authenticated.from("profiles").select("account_name").eq("id", userId).single();
  expect(before.error).toBeNull();

  const attemptedName = `E2E変更不可${Date.now()}`;
  const update = await authenticated.from("profiles").update({ account_name: attemptedName }).eq("id", userId).select("account_name");
  expect(update.error).not.toBeNull();

  const after = await authenticated.from("profiles").select("account_name").eq("id", userId).single();
  expect(after.error).toBeNull();
  expect(after.data?.account_name).toBe(before.data?.account_name);
});
