import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("認証済みユーザーの基本フロー", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("ログインして議題を作成し、参加して本筋投稿できる", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Basic Flow ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E basic topic content");
    await page.locator('[name="category"]').selectOption("technology");
    await expect(page.locator('[name="debateType"]')).toHaveValue("exploration");
    await expect(page.locator('[name="nameMode"]:checked')).toHaveValue("topic_alias");
    await page.getByTestId("topic-create-submit").click();

    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();
    await expect(page.getByTestId("topic-category-badge")).toHaveText("技術");

    await expect(page.getByTestId("join-topic-submit")).toHaveCount(0);
      const mainPostContent = page.getByTestId("main-post-content");
      await expect(page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });
      await expect(mainPostContent).toBeHidden();
      await page.getByTestId("main-post-composer-open").click();
      await expect(mainPostContent).toBeVisible({ timeout: 10_000 });

      await mainPostContent.fill("E2E retained draft");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("main-post-composer-open")).toBeVisible();
      await page.getByTestId("main-post-composer-open").click();
      await expect(mainPostContent).toHaveValue("E2E retained draft");

      const postBody = "E2E basic main post";
      await mainPostContent.fill(postBody);
    await page.getByTestId("main-post-submit").click();
    await expect(page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });
    const postCard = page.locator("article").filter({ hasText: postBody }).first();
    await expect(postCard).toBeVisible();
    await expect(postCard).toContainText("主催");
    await expect(page.getByTestId("topic-recent-posts")).toHaveText("24h 1発言");
  });
});
