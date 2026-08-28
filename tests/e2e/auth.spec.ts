import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;

test("USER1でログインしてマイページへ移動できる", async ({ page }) => {
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  await page.goto("/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
  await expect(page.getByTestId("login-password")).toBeVisible();
  await expect(page.getByTestId("login-submit")).toBeVisible();
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);
});

test("ログイン画面は項目別validationとパスワード表示切替を提供する", async ({ page }) => {
  await page.goto("/login");
  await page.getByTestId("login-submit").click();
  await expect(page.getByText("メールアドレスを入力してください。")).toBeVisible();
  await expect(page.getByText("パスワードを入力してください。")).toBeVisible();

  const passwordInput = page.getByTestId("login-password");
  await expect(passwordInput).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "パスワードを表示する" }).click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(page.getByRole("link", { name: "新規登録" })).toHaveAttribute("href", "/signup");
});

test("新規登録画面は必須項目とパスワード不一致を入力欄付近に表示する", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("アカウント名を入力してください。")).toBeVisible();
  await expect(page.getByText("メールアドレスを入力してください。")).toBeVisible();

  await page.getByLabel("アカウント名", { exact: true }).fill("テスト利用者");
  await page.getByLabel("メールアドレス", { exact: true }).fill("validation@example.com");
  await page.getByLabel("パスワード", { exact: true }).fill("password-one");
  await page.getByLabel("パスワード確認", { exact: true }).fill("password-two");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("パスワードが一致しません。")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/login");
});

test("認証カードは375px幅で横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  const sizes = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  await expect(page.getByRole("button", { name: "アカウントを作成" })).toBeVisible();
});
