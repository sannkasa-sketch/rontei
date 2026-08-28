import { expect, test } from "@playwright/test";

test("マイページでプロフィールと参加討論を確認できる", async ({ page }) => {
  const email = process.env.E2E_USER1_EMAIL;
  const password = process.env.E2E_USER1_PASSWORD;
  if (!email || !password) throw new Error("E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);

  await expect(page.getByRole("heading", { name: "マイページ" })).toBeVisible();
  await expect(page.getByText("アカウント名", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("評価ポイント", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "参加中の討論" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "過去の討論" })).toBeVisible();
  await expect(page.getByLabel(/件/)).toHaveCount(2);

  const activeSection = page.getByTestId("activity-section-active");
  const activeCards = activeSection.locator('a[href^="/topics/"]');
  const activeToggle = page.getByTestId("activity-toggle-active");
  const totalActive = Number((await activeSection.getByLabel(/件/).textContent())?.replace(/\D/g, "") ?? 0);
  if (totalActive > 4) {
    await expect(activeCards).toHaveCount(4);
    await expect(activeToggle).toContainText(`あと${totalActive - 4}件`);
    await activeToggle.click();
    await expect(activeCards).toHaveCount(totalActive);
    await expect(activeToggle).toContainText("折りたたむ");
    await activeToggle.click();
    await expect(activeCards).toHaveCount(4);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);

  const activityLinks = page.locator('main a[href^="/topics/"], main a[href^="/records/"]');
  await expect(activityLinks.first()).toBeVisible();
  const href = await activityLinks.first().getAttribute("href");
  await activityLinks.first().click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});
