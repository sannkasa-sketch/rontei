import { expect, test } from "@playwright/test";
import { createHmac, randomBytes } from "node:crypto";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const recoverySecret = process.env.RECOVERY_MARKER_SECRET;

function createTestRecoveryMarker(userId: string, expiresAt = Math.floor(Date.now() / 1000) + 15 * 60) {
  if (!recoverySecret || Buffer.byteLength(recoverySecret, "utf8") < 32) throw new Error("RECOVERY_MARKER_SECRET が必要です");
  const encodedPayload = Buffer.from(JSON.stringify({
    sub: userId,
    exp: expiresAt,
    nonce: randomBytes(32).toString("base64url"),
  }), "utf8").toString("base64url");
  const signature = createHmac("sha256", recoverySecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

async function login(page: import("@playwright/test").Page) {
  if (!email || !password) throw new Error("E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  const authResponsePromise = page.waitForResponse((response) => response.url().includes("/auth/v1/token") && response.request().method() === "POST");
  await page.getByTestId("login-submit").click();
  const authResponse = await authResponsePromise;
  const authResult = await authResponse.json();
  await expect(page).toHaveURL(/\/mypage$/);
  const userId = authResult?.user?.id;
  if (typeof userId !== "string" || !userId) throw new Error("ログイン結果からUSER1を確認できませんでした");
  return userId;
}

async function setRecoveryMarker(context: import("@playwright/test").BrowserContext, origin: string, value: string) {
  await context.addCookies([{
    name: "rontei_recovery_reset",
    value,
    domain: new URL(origin).hostname,
    path: "/account/update-password",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

test("ログイン画面からパスワード再設定へ移動できる", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "パスワードを忘れた方" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "パスワード再設定" })).toBeVisible();
});

test("再設定メールフォームは空欄と不正なメール形式をAPI送信前に拒否する", async ({ page }) => {
  let recoverApiCalls = 0;
  await page.route("**/auth/v1/recover**", async (route) => {
    recoverApiCalls += 1;
    await route.abort();
  });
  await page.goto("/forgot-password");
  await page.getByTestId("forgot-password-submit").click();
  await expect(page.getByText("メールアドレスを入力してください。")).toBeVisible();
  await page.getByLabel("メールアドレス", { exact: true }).fill("かさかさ");
  await page.getByTestId("forgot-password-submit").click();
  await expect(page.getByText("正しい形式のメールアドレスを入力してください。")).toBeVisible();
  expect(recoverApiCalls).toBe(0);
});

test("Turnstile未完了時は再設定APIを呼ばない", async ({ page }) => {
  await page.addInitScript(() => { window.__TURNSTILE_E2E_AUTO_VERIFY__ = false; });
  let recoverApiCalled = false;
  await page.route("**/auth/v1/recover**", async (route) => {
    recoverApiCalled = true;
    await route.abort();
  });
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス", { exact: true }).fill("recovery@example.com");
  await page.getByTestId("forgot-password-submit").click();
  await expect(page.getByText("セキュリティ確認を完了してください。")).toBeVisible();
  expect(recoverApiCalled).toBe(false);
});

test("再設定APIへcaptchaTokenを渡しgenericな受付結果を表示する", async ({ page }) => {
  let captchaToken: unknown;
  await page.route("**/auth/v1/recover**", async (route) => {
    captchaToken = route.request().postDataJSON()?.gotrue_meta_security?.captcha_token;
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/forgot-password");
  await page.getByLabel("メールアドレス", { exact: true }).fill("unknown-or-registered@example.com");
  await page.getByTestId("forgot-password-submit").click();
  const status = page.getByTestId("recovery-request-success");
  await expect(status).toContainText("パスワード再設定の手続きを受け付けました。");
  await expect(status).toContainText("登録済みのメールアドレスの場合は、再設定用メールを送信しました。");
  expect(captchaToken).toBe("e2e-turnstile-token");
});

test("再設定API失敗後はTurnstile tokenをresetする", async ({ page }) => {
  await page.route("**/auth/v1/recover**", async (route) => {
    await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ message: "captcha verification process failed" }) });
  });
  await page.goto("/forgot-password");
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "verified");
  await page.getByLabel("メールアドレス", { exact: true }).fill("recovery@example.com");
  await page.getByTestId("forgot-password-submit").click();
  await expect(page.getByText("セキュリティ確認に失敗しました。もう一度お試しください。")).toBeVisible();
  await expect(page.getByTestId("turnstile-widget")).toHaveAttribute("data-turnstile-state", "unverified");
});

test("通常ログインsessionだけではパスワード更新フォームを利用できない", async ({ page }) => {
  await login(page);
  await page.goto("/account/update-password");
  await expect(page.getByRole("heading", { name: "再設定リンクが必要です" })).toBeVisible();
  await expect(page.getByTestId("update-password-submit")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "再設定メールを送る" })).toHaveAttribute("href", "/forgot-password");
});

test("偽造・別user・期限切れ・改ざんmarkerを拒否し、有効markerだけを許可する", async ({ page, context }) => {
  const userId = await login(page);
  const origin = new URL(page.url()).origin;

  for (const marker of [
    "forged-marker",
    createTestRecoveryMarker("00000000-0000-4000-8000-000000000002"),
    createTestRecoveryMarker(userId, Math.floor(Date.now() / 1000) - 1),
  ]) {
    await setRecoveryMarker(context, origin, marker);
    await page.goto("/account/update-password");
    await expect(page.getByTestId("update-password-submit")).toHaveCount(0);
  }

  const validMarker = createTestRecoveryMarker(userId);
  const tamperedMarker = `${validMarker.slice(0, -1)}${validMarker.endsWith("a") ? "b" : "a"}`;
  await setRecoveryMarker(context, origin, tamperedMarker);
  await page.goto("/account/update-password");
  await expect(page.getByTestId("update-password-submit")).toHaveCount(0);

  await setRecoveryMarker(context, origin, validMarker);

  let updateRequestSeen = false;
  await page.route("**/auth/v1/user**", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    updateRequestSeen = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated" }),
    });
  });

  await page.goto("/account/update-password");
  await expect(page.getByTestId("update-password-submit")).toBeVisible();
  await page.getByLabel("新しいパスワード", { exact: true }).fill("1234567");
  await page.getByLabel("新しいパスワード確認", { exact: true }).fill("1234567");
  await page.getByTestId("update-password-submit").click();
  await expect(page.getByText("パスワードは8文字以上で入力してください。")).toBeVisible();
  expect(updateRequestSeen).toBe(false);

  await page.getByLabel("新しいパスワード", { exact: true }).fill("eight-ok");
  await page.getByLabel("新しいパスワード確認", { exact: true }).fill("different");
  await page.getByTestId("update-password-submit").click();
  await expect(page.getByText("パスワードが一致しません。")).toBeVisible();
  expect(updateRequestSeen).toBe(false);

  await page.getByLabel("新しいパスワード確認", { exact: true }).fill("eight-ok");
  const cleanupResponsePromise = page.waitForResponse((response) => response.url().endsWith("/account/update-password/complete") && response.request().method() === "POST");
  await page.getByTestId("update-password-submit").click();
  const cleanupResponse = await cleanupResponsePromise;
  expect(cleanupResponse.status()).toBe(204);
  await expect(page.getByTestId("password-update-success")).toContainText("パスワードを更新しました。");
  await expect(page.getByRole("heading", { name: "再設定リンクが必要です" })).toHaveCount(0);
  expect(updateRequestSeen).toBe(true);
  await expect.poll(async () => (await context.cookies()).some((cookie) => cookie.name === "rontei_recovery_reset")).toBe(false);
});

test("パスワード復旧画面は375pxで横スクロールしない", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/forgot-password", "/account/update-password"]) {
    await page.goto(path);
    const sizes = await page.evaluate(() => ({ body: document.body.scrollWidth, viewport: window.innerWidth }));
    expect(sizes.body).toBeLessThanOrEqual(sizes.viewport);
  }
});
