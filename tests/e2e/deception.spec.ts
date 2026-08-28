import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("虚偽許可", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("虚偽を許可した議題では懐疑リアクションを表示しない", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Deception ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E deception topic content");
    await expect(page.locator('[name="debateType"]')).toHaveValue("exploration");
    await expect(page.locator('[name="nameMode"]:checked')).toHaveValue("topic_alias");
    await page.locator('[name="allowDeception"]').check();
    await page.getByTestId("topic-create-submit").click();

    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();
    await expect(page.getByText("虚偽発言", { exact: true })).toBeVisible();
    await expect(page.getByText("虚偽が許可されているため「懐疑」評価は使用できません。", { exact: true })).toBeVisible();

    await expect(page.getByTestId("join-topic-submit")).toHaveCount(0);
    const mainPostContent = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(mainPostContent).toBeVisible({ timeout: 10_000 });

    const postBody = "E2E deception post";
    await mainPostContent.fill(postBody);
    await page.getByTestId("main-post-submit").click();
    const postCard = page.locator("article").filter({ hasText: postBody }).first();
    await expect(postCard).toBeVisible();
    await postCard.hover();
    await expect(postCard.getByRole("button", { name: /^納得\s/ })).toBeVisible();
    await expect(postCard.getByRole("button", { name: /^不服\s/ })).toBeVisible();
    await expect(postCard.getByRole("button", { name: /^微妙\s/ })).toBeVisible();
    await expect(postCard.getByRole("button", { name: /^懐疑\s/ })).toHaveCount(0);
  });
});
