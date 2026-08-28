import { expect, test } from "@playwright/test";

const publicPages = [
  { name: "ホームページ", path: "/" },
  { name: "議題一覧", path: "/topics" },
  { name: "記録一覧", path: "/records" },
  { name: "利用規約", path: "/terms" },
  { name: "プライバシーポリシー", path: "/privacy" },
] as const;

for (const publicPage of publicPages) {
  test(`${publicPage.name}が表示される`, async ({ page }) => {
    const response = await page.goto(publicPage.path);

    expect(response, "ページからHTTPレスポンスが返ること").not.toBeNull();
    expect(response?.ok(), `HTTP status: ${response?.status()}`).toBe(true);
    await expect(page).toHaveURL(publicPage.path);
    await expect(page.locator("body")).toBeVisible();
  });
}
