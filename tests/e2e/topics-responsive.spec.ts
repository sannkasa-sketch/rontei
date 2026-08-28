import { expect, test } from "@playwright/test";

test("議題カードの列数が画面幅に応じて変わる", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto("/topics");
  const grid = page.getByTestId("topics-grid");
  await expect(grid).toBeVisible();
  const mobileColumns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(mobileColumns).toBe(1);

  await page.setViewportSize({ width: 1200, height: 900 });
  const desktopColumns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(desktopColumns).toBe(3);

  await page.setViewportSize({ width: 1600, height: 1000 });
  const wideColumns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(wideColumns).toBe(4);

  await page.setViewportSize({ width: 1920, height: 1000 });
  const extraWideColumns = await grid.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length);
  expect(extraWideColumns).toBe(4);
});
