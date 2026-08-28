import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("派閥移動", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("移動前後の投稿スナップショットと移動イベントを表示する", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Faction Change ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E faction change topic content");
    await page.locator('[name="debateType"]').selectOption("superiority");
    await expect(page.locator('[name="nameMode"]:checked')).toHaveValue("topic_alias");
    await page.locator('[name="allowFactionChange"]').check();
    await page.getByTestId("topic-create-submit").click();

    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();

    await page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
    await page.getByTestId("join-topic-submit").click();
    const mainPostContent = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(mainPostContent).toBeVisible({ timeout: 10_000 });

    const beforeBody = "E2E before faction change";
    await mainPostContent.fill(beforeBody);
    await page.getByTestId("main-post-submit").click();
    const beforePost = page.locator("article").filter({ hasText: beforeBody }).first();
    await expect(beforePost).toBeVisible();
    await expect(beforePost).toContainText("賛成");
    await expect(beforePost).not.toContainText("反対 ← 賛成");

    await page.getByTestId("main-post-composer-open").click();
    const changeOpen = page.getByTestId("faction-change-open");
    const membershipPanel = changeOpen.locator("xpath=ancestor::section[1]");
    await expect(membershipPanel).toContainText("現在の派閥：賛成");
    await changeOpen.click();
    await page.getByTestId("faction-change-select").selectOption({ label: "反対" });
    await page.getByRole("button", { name: "派閥を変更", exact: true }).click();
    await expect(page.getByText("賛成から反対へ移動します。", { exact: false })).toBeVisible();
    await page.getByTestId("faction-change-submit").click();
    await expect(page.getByTestId("faction-change-open")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("faction-change-open").locator("xpath=ancestor::section[1]")).toContainText("現在の派閥：反対");

    const afterBody = "E2E after faction change";
    if (!(await mainPostContent.isVisible())) await page.getByTestId("main-post-composer-open").click();
    await mainPostContent.fill(afterBody);
    await page.getByTestId("main-post-submit").click();
    const afterPost = page.locator("article").filter({ hasText: afterBody }).first();
    await expect(afterPost).toBeVisible();
    await expect(afterPost).toContainText("反対");
    await expect(afterPost).toContainText("← 賛成");

    await expect(beforePost).toContainText("賛成");
    await expect(beforePost).not.toContainText("反対 ← 賛成");

    const moveEvent = page.getByTestId("faction-change-event").filter({ hasText: "賛成" }).filter({ hasText: "反対" });
    await expect(moveEvent).toBeVisible();
    await expect(moveEvent).toContainText("賛成");
    await expect(moveEvent).toContainText("→");
    await expect(moveEvent).toContainText("反対");
  });
});
