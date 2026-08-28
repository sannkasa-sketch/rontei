import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("募集形式", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("本筋投稿とリアクションを表示し、返信作成UIを表示しない", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Recruitment ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E recruitment topic content");
    await page.locator('[name="debateType"]').selectOption("recruitment");
    await expect(page.locator('[name="nameMode"]:checked')).toHaveValue("topic_alias");
    await page.getByTestId("topic-create-submit").click();

    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();
    await expect(page.getByText("発言への賛同・反論・補足返信はできません。", { exact: false })).toBeVisible();

    await expect(page.getByTestId("join-topic-submit")).toHaveCount(0);
    const mainPostContent = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(mainPostContent).toBeVisible({ timeout: 10_000 });

    const postBody = "E2E recruitment main post";
    await mainPostContent.fill(postBody);
    await page.getByTestId("main-post-submit").click();
    const postCard = page.locator("article").filter({ hasText: postBody }).first();
    await expect(postCard).toBeVisible();
    await postCard.hover();
    await expect(postCard.getByRole("button", { name: "＋ 賛同", exact: true })).toHaveCount(0);
    await expect(postCard.getByRole("button", { name: "＋ 反論", exact: true })).toHaveCount(0);
    await expect(postCard.getByRole("button", { name: "＋ 補足", exact: true })).toHaveCount(0);
    await expect(postCard.getByRole("button", { name: /^納得\s/ })).toBeVisible();
  });
});
