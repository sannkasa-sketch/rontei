import { expect, type Page } from "@playwright/test";

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);
}

export async function createFutureEndSetting(page: Page, offsetMs = 120_000) {
  return page.evaluate((duration) => {
    const date = new Date(Date.now() + duration);
    date.setSeconds(0, 0);
    const pad = (value: number) => String(value).padStart(2, "0");
    return {
      input: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`,
      timestamp: date.getTime(),
    };
  }, offsetMs);
}

export async function getCreatedTopicSlug(page: Page, topicTitle: string) {
  await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();
  await expect(page).toHaveURL(/\/topics\/(?!new(?:$|[/?#]))[^/?#]+$/);
  return new URL(page.url()).pathname.split("/").filter(Boolean).at(-1)!;
}

export async function waitForTopicEnd(page: Page, slug: string, endsAtTimestamp: number) {
  const waitMs = endsAtTimestamp - Date.now() + 20_000;
  expect(waitMs).toBeGreaterThan(0);
  expect(waitMs).toBeLessThanOrEqual(300_000);
  await page.waitForTimeout(waitMs);
  await page.goto(`/topics/${encodeURIComponent(slug)}`);
  await expect(page.getByTestId("topic-remaining-time")).toHaveText("終了");
}
