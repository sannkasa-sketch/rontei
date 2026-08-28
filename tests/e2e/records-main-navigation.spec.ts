import { expect, test } from "@playwright/test";

test("複雑な議事録でsticky本筋とnavigatorのactive post idが一致する", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/records/topic-421519361bda401b92aadd7b63f8da98");
  await expect(page.getByRole("heading", { name: "[UI-DEMO] 議事録・複雑ツリー表示確認" })).toBeVisible();
  const navigator = page.getByTestId("main-post-navigator");
  await expect(navigator).toBeVisible();

  for (const number of ["11", "10", "09", "06"]) {
    await page.getByTestId(`main-post-nav-marker-${number}`).click();
    await expect.poll(async () => {
      const stickyPostId = await page.locator('[data-sticky-active="true"]').getAttribute("data-post-id");
      const activePostId = await navigator.getAttribute("data-active-main-post-id");
      return stickyPostId && activePostId ? `${stickyPostId}:${activePostId}` : "waiting";
    }, { timeout: 10_000 }).toMatch(/^([^:]+):\1$/);
  }
});
