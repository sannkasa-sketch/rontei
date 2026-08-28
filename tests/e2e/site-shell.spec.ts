import { expect, test } from "@playwright/test";

test("論庭のブランド名・コピー・metadataを表示する", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("論庭");
  await expect(page.getByTestId("home-hero")).toHaveText("論庭");
  await expect(page.getByText("違いが芽吹く、対話の庭。", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "論庭 ホーム", exact: true }).first()).toHaveAttribute("href", "/");

  await page.goto("/topics");
  await expect(page).toHaveTitle("議題一覧 | 論庭");
});

test("存在しないURL・議題・議事録を共通404で案内する", async ({ page }) => {
  for (const path of ["/this-page-does-not-exist", "/topics/__missing-topic__", "/records/__missing-record__"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "ページが見つかりません" })).toBeVisible();
    await expect(page.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
  }
  await page.getByRole("link", { name: "ホームへ戻る" }).click();
  await expect(page).toHaveURL("/");
});

test("Headerは現在ページを示し、主要公開ページは375pxで横にはみ出さない", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(message.text()); });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  for (const path of ["/", "/topics", "/records", "/login", "/signup", "/terms", "/privacy"]) {
    await page.goto(path);
    const sizes = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
    expect(sizes.documentWidth, path).toBeLessThanOrEqual(sizes.viewportWidth);
  }
  await page.goto("/topics");
  await expect(page.getByLabel("メインナビゲーション").getByRole("link", { name: "議題一覧" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "論庭 ホーム", exact: true }).first()).toHaveAttribute("href", "/");
  expect(runtimeErrors).toEqual([]);
  await page.goto("/this-page-does-not-exist");
  const notFoundSizes = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth }));
  expect(notFoundSizes.documentWidth).toBeLessThanOrEqual(notFoundSizes.viewportWidth);
});

test("Footerから利用規約とプライバシーポリシーへ移動できる", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  await footer.getByRole("link", { name: "利用規約" }).click();
  await expect(page).toHaveURL("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "利用規約" })).toBeVisible();
  await page.locator("footer").getByRole("link", { name: "プライバシーポリシー" }).click();
  await expect(page).toHaveURL("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "プライバシーポリシー" })).toBeVisible();
});

test("公開レスポンスに安全なheaders・robots・sitemapを提供する", async ({ request }) => {
  const response = await request.get("/");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /mypage");
  expect(robots).toContain("Sitemap:");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>http://localhost:3000/topics</loc>");
  expect(sitemap).not.toContain("[E2E]");
  expect(sitemap).not.toContain("[UI-DEMO]");
});
