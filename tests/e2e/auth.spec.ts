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

test("ログインはTurnstile未完了時に認証APIを呼ばない", async ({ page }) => {
  await page.addInitScript(() => { window.__TURNSTILE_E2E_AUTO_VERIFY__ = false; });
  let loginApiCalled = false;
  await page.route("**/auth/v1/token**", async (route) => {
    loginApiCalled = true;
    await route.abort();
  });

  await page.goto("/login");
  await page.getByTestId("login-email").fill("turnstile-check@example.com");
  await page.getByTestId("login-password").fill("valid-password");
  await page.getByTestId("login-submit").click();

  await expect(page.getByText("セキュリティ確認を完了してください。")).toBeVisible();
  expect(loginApiCalled).toBe(false);
});

test("ログインはcaptchaTokenを渡し、認証失敗後にTurnstileをresetする", async ({ page }) => {
  let captchaToken: unknown;
  await page.route("**/auth/v1/token**", async (route) => {
    captchaToken = route.request().postDataJSON()?.gotrue_meta_security?.captcha_token;
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "Invalid login credentials" }) });
  });

  await page.goto("/login");
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "verified");
  await page.getByTestId("login-email").fill("turnstile-check@example.com");
  await page.getByTestId("login-password").fill("valid-password");
  await page.getByTestId("login-submit").click();

  await expect(page.getByText("メールアドレスまたはパスワードを確認してください。")).toBeVisible();
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "unverified");
  expect(captchaToken).toBe("e2e-turnstile-token");
});

test("新規登録画面は必須項目とパスワード不一致を入力欄付近に表示する", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("アカウント名を入力してください。")).toBeVisible();
  await expect(page.getByText("メールアドレスを入力してください。")).toBeVisible();

  await page.getByLabel("アカウント名", { exact: true }).fill("テスト利用者");
  await page.getByLabel("メールアドレス", { exact: true }).fill("validation@example.com");
  await page.getByLabel("パスワード", { exact: true }).fill("1234567");
  await page.getByLabel("パスワード確認", { exact: true }).fill("1234567");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("パスワードは8文字以上で入力してください。")).toBeVisible();

  await page.getByLabel("パスワード", { exact: true }).fill("password-one");
  await page.getByLabel("パスワード確認", { exact: true }).fill("password-two");
  await page.getByRole("button", { name: "アカウントを作成" }).click();
  await expect(page.getByText("パスワードが一致しません。")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "ログイン" })).toHaveAttribute("href", "/login");
});

test("新規登録画面は不正なメール形式を認証APIへ送信しない", async ({ page }) => {
  let signupApiCalled = false;
  await page.route("**/auth/v1/signup**", async (route) => {
    signupApiCalled = true;
    await route.abort();
  });

  await page.goto("/signup");
  await page.getByLabel("アカウント名", { exact: true }).fill("メール形式確認");
  await page.getByLabel("メールアドレス", { exact: true }).fill("かさかさ");
  await page.getByLabel("パスワード", { exact: true }).fill("valid-password");
  await page.getByLabel("パスワード確認", { exact: true }).fill("valid-password");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  await expect(page.getByText("正しい形式のメールアドレスを入力してください。")).toBeVisible();
  expect(signupApiCalled).toBe(false);
});

test("新規登録はTurnstile未完了時にsignup APIを呼ばない", async ({ page }) => {
  await page.addInitScript(() => { window.__TURNSTILE_E2E_AUTO_VERIFY__ = false; });
  let signupApiCalled = false;
  await page.route("**/auth/v1/signup**", async (route) => {
    signupApiCalled = true;
    await route.abort();
  });

  await page.goto("/signup");
  await page.getByLabel("アカウント名", { exact: true }).fill("Turnstile未完了確認");
  await page.getByLabel("メールアドレス", { exact: true }).fill("turnstile-signup@example.com");
  await page.getByLabel("パスワード", { exact: true }).fill("valid-password");
  await page.getByLabel("パスワード確認", { exact: true }).fill("valid-password");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  await expect(page.getByText("セキュリティ確認を完了してください。")).toBeVisible();
  expect(signupApiCalled).toBe(false);
});

test("新規登録はcaptchaTokenをsignup APIへ渡す", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let captchaToken: unknown;
  await page.route("**/auth/v1/signup**", async (route) => {
    captchaToken = route.request().postDataJSON()?.gotrue_meta_security?.captcha_token;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`, email: `masked-${unique}@example.com`, confirmation_sent_at: new Date().toISOString() }),
    });
  });

  await page.goto("/signup");
  await page.getByLabel("アカウント名", { exact: true }).fill(`Captcha確認${unique.slice(-6)}`);
  await page.getByLabel("メールアドレス", { exact: true }).fill(`captcha-${unique}@example.com`);
  await page.getByLabel("パスワード", { exact: true }).fill("valid-password");
  await page.getByLabel("パスワード確認", { exact: true }).fill("valid-password");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  await expect(page.getByTestId("signup-success")).toBeVisible();
  expect(captchaToken).toBe("e2e-turnstile-token");
});

test("新規登録はCAPTCHA失敗後にTurnstileをresetする", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.route("**/auth/v1/signup**", async (route) => {
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "captcha verification process failed" }) });
  });

  await page.goto("/signup");
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "verified");
  await page.getByLabel("アカウント名", { exact: true }).fill(`Captcha失敗${unique.slice(-6)}`);
  await page.getByLabel("メールアドレス", { exact: true }).fill(`captcha-failure-${unique}@example.com`);
  await page.getByLabel("パスワード", { exact: true }).fill("valid-password");
  await page.getByLabel("パスワード確認", { exact: true }).fill("valid-password");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  await expect(page.getByText("セキュリティ確認に失敗しました。もう一度お試しください。")).toBeVisible();
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "unverified");
});

test("認証カードは375px幅で横にはみ出さない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/signup");
  const sizes = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  await expect(page.getByTestId("turnstile-widget")).toBeVisible();
  await expect(page.getByRole("button", { name: "アカウントを作成" })).toBeVisible();
});

test("メール確認待ちの登録受付は既存メールでも矛盾しない案内を表示する", async ({ page }) => {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.route("**/auth/v1/signup**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: `00000000-0000-4000-8000-${Date.now().toString().slice(-12)}`, email: `masked-${unique}@example.com`, confirmation_sent_at: new Date().toISOString() }),
    });
  });

  await page.goto("/signup");
  const accountName = `受付案内${unique.slice(-6)}`;
  await page.getByLabel("アカウント名", { exact: true }).fill(accountName);
  await page.getByLabel("アカウント名", { exact: true }).blur();
  await expect(page.getByText("このアカウント名は使用できます。")).toBeVisible();
  await page.getByLabel("メールアドレス", { exact: true }).fill(`signup-message-${unique}@example.com`);
  await page.getByLabel("パスワード", { exact: true }).fill("signup-message-password");
  await page.getByLabel("パスワード確認", { exact: true }).fill("signup-message-password");
  await page.getByRole("button", { name: "アカウントを作成" }).click();

  const status = page.getByTestId("signup-success");
  await expect(status).toContainText("登録手続きを受け付けました。");
  await expect(status).toContainText("未登録のメールアドレスの場合は、確認メールを送信しました。");
  await expect(status).toContainText("すでにアカウントをお持ちの場合は、ログインしてください。");
  await expect(status.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", "/login");
});
