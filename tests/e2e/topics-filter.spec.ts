import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;

test.describe("議題一覧のカテゴリ絞り込み", () => {
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("技術カテゴリだけをDB側で絞り込んで表示する", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    await page.locator('[name="title"]').fill(`[E2E] Category Filter ${Date.now()}`);
    await page.locator('[name="content"]').fill("E2E category filter topic");
    await page.locator('[name="category"]').selectOption("technology");
    await page.getByTestId("topic-create-submit").click();
    await expect(page).toHaveURL(/\/topics\/[^/]+$/);

    await page.goto("/topics");
    await page.getByTestId("category-filter-technology").click();
    await expect(page).toHaveURL(/category=technology/);
    const badges = page.getByTestId("topics-grid").getByTestId("topic-category-badge");
    await expect(badges.first()).toBeVisible();
    const labels = await badges.allTextContents();
    expect(labels.every((label) => label.trim() === "技術")).toBe(true);
    const technologyCards = page.locator('[data-topic-category="technology"]');
    await expect(technologyCards.first()).toBeVisible();
    await expect(technologyCards.first()).toHaveClass(/bg-blue-50\/30/);
  });
});
