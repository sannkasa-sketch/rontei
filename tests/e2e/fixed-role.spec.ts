import { expect, test } from "@playwright/test";

const user1Email = process.env.E2E_USER1_EMAIL;
const user1Password = process.env.E2E_USER1_PASSWORD;
const user2Email = process.env.E2E_USER2_EMAIL;
const user2Password = process.env.E2E_USER2_PASSWORD;

test("固定役割形式では作成者を派閥1、通常参加者を派閥2へ割り当てる", async ({ browser, page }) => {
  test.skip(!user1Email || !user1Password || !user2Email || !user2Password, "E2E_USER1/USER2 の認証情報が必要です");
  test.setTimeout(120_000);

  await page.goto("/login");
  await page.getByTestId("login-email").fill(user1Email!);
  await page.getByTestId("login-password").fill(user1Password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);

  await page.goto("/topics/new");
  const title = `[E2E] Fixed Roles ${Date.now()}`;
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="content"]').fill("E2E fixed role semantics");
  await expect(page.locator('[name="debateType"]')).toHaveValue("exploration");
  const factionInputs = page.getByRole("heading", { name: "派閥", exact: true }).locator("xpath=ancestor::section[1]").locator("input");
  await expect(factionInputs.nth(0)).toHaveValue("主催");
  await expect(factionInputs.nth(1)).toHaveValue("参加者");
  await expect(page.locator('[name="allowFactionChange"]')).toHaveCount(0);
  await expect(page.getByTestId("creator-speaker-name")).toHaveValue(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  await page.getByTestId("topic-create-submit").click();
  await expect(page).toHaveURL(/\/topics\/(?!new(?:$|[/?#]))[^/?#]+$/);
  const topicUrl = page.url();
  await expect(page.getByTestId("join-topic-submit")).toHaveCount(0);
  await page.getByTestId("main-post-composer-open").click();
  await page.getByTestId("main-post-content").fill("E2E creator fixed role post");
  await page.getByTestId("main-post-submit").click();
  await expect(page.getByTestId("post-card").filter({ hasText: "E2E creator fixed role post" })).toContainText("主催");

  const user2Context = await browser.newContext();
  const user2Page = await user2Context.newPage();
  try {
    await user2Page.goto("/login");
    await user2Page.getByTestId("login-email").fill(user2Email!);
    await user2Page.getByTestId("login-password").fill(user2Password!);
    await user2Page.getByTestId("login-submit").click();
    await expect(user2Page).toHaveURL(/\/mypage$/);
    await user2Page.goto(topicUrl);
    await expect(user2Page.getByTestId("join-faction-select")).toHaveCount(0);
    await expect(user2Page.getByTestId("join-fixed-faction")).toContainText("参加者");
    await user2Page.getByTestId("join-topic-submit").click();
    await expect(user2Page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });
    await user2Page.getByTestId("main-post-composer-open").click();
    await user2Page.getByTestId("main-post-content").fill("E2E participant fixed role post");
    await user2Page.getByTestId("main-post-submit").click();
    await expect(user2Page.getByTestId("post-card").filter({ hasText: "E2E participant fixed role post" })).toContainText("参加者");
  } finally {
    await user2Context.close();
  }
});
