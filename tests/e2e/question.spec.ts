import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;

test("質問を親投稿への返信として投稿できる", async ({ page }) => {
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");
  test.setTimeout(120_000);

  await page.goto("/login");
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);

  await page.goto("/topics/new");
  const title = `[E2E] Question ${Date.now()}`;
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="content"]').fill("E2E question topic content");
  await page.getByTestId("topic-create-submit").click();
  await expect(page).toHaveURL(/\/topics\/[^/]+$/);

  await expect(page.getByTestId("join-topic-submit")).toHaveCount(0);
  await expect(page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });
  await page.getByTestId("main-post-composer-open").click();
  const parentBody = "E2E question parent post";
  await page.getByTestId("main-post-content").fill(parentBody);
  await page.getByTestId("main-post-submit").click();

  const parentCard = page.getByTestId("post-card").filter({ hasText: parentBody }).first();
  await expect(parentCard).toBeVisible();
  await parentCard.hover();
  await parentCard.getByTestId("reply-action-question").click();
  const questionBody = "E2E question reply";
  await page.getByTestId("reply-content-question").fill(questionBody);
  const questionSubmit = page.getByTestId("reply-submit-question");
  await expect(questionSubmit).toBeEnabled();
  await questionSubmit.dispatchEvent("click");

  const parentTree = parentCard.locator("xpath=..");
  const questionCard = parentTree.locator('[data-testid="post-card"][data-relation-type="question"]').filter({ hasText: questionBody }).first();
  await expect(questionCard).toBeVisible({ timeout: 10_000 });
  await expect(questionCard).toContainText("質問");
});
