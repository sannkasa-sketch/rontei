import { expect, test } from "@playwright/test";

test("ホームから討論中の議題と最近の議事録へ移動できる", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("home-hero")).toHaveText("論庭");
  await expect(page.getByRole("link", { name: /議題を探す/ })).toHaveAttribute("href", "/topics");
  await expect(page.getByTestId("home-topic-card")).not.toHaveCount(0);
  expect(await page.getByTestId("home-topic-card").count()).toBeLessThanOrEqual(6);
  for (const title of await page.getByTestId("home-active-topics").locator("h3").allTextContents()) expect(title.startsWith("[E2E]")).toBe(false);
  const endingSoon = page.getByTestId("home-ending-soon");
  if (await endingSoon.count()) await expect(endingSoon.getByText("終了", { exact: true })).toHaveCount(0);
  expect(await page.getByTestId("home-record-card").count()).toBeLessThanOrEqual(4);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  const topicCard = page.getByTestId("home-topic-card").first().locator('a[href^="/topics/"]');
  await expect(topicCard).toBeVisible();
  await topicCard.click();
  await expect(page).toHaveURL(/\/topics\/[^/]+$/);
  await page.goto("/");
  const recordCard = page.getByTestId("home-record-card").first();
  await expect(recordCard).toBeVisible();
  await recordCard.click();
  await expect(page).toHaveURL(/\/records\/[^/]+$/);
});
