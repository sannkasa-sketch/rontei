import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("複数派閥", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("追加所属した立場を投稿ごとに選び、解除後も過去投稿を維持する", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Multiple Factions ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E multiple factions topic content");
    await page.locator('[name="debateType"]').selectOption("superiority");
    await expect(page.locator('[name="nameMode"]:checked')).toHaveValue("topic_alias");
    await page.locator('[name="allowMultipleFactions"]').check();
    await expect(page.locator('[name="allowFactionChange"]')).not.toBeChecked();
    await expect(page.locator('[name="allowFactionAddition"]')).not.toBeChecked();
    await page.getByTestId("topic-create-submit").click();

    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
    await page.getByTestId("join-topic-submit").click();
    const mainPostContent = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(mainPostContent).toBeVisible({ timeout: 10_000 });

    const memberships = page.getByTestId("member-factions");
    await expect(memberships).toContainText("★");
    await expect(memberships).toContainText("賛成");
    await expect(memberships).toContainText("メイン");

    await page.getByTestId("add-member-faction-open").click();
    await page.getByTestId("add-member-faction-select").selectOption({ label: "反対" });
    await page.getByTestId("add-member-faction-submit").click();
    await expect(memberships).toContainText("✓");
    await expect(memberships).toContainText("反対");
    const primaryMembership = memberships.locator("li").filter({ hasText: "賛成" });
    const secondaryMembership = memberships.locator("li").filter({ hasText: "反対" });
    await expect(primaryMembership).toContainText("★");
    await expect(primaryMembership).toContainText("メイン");
    await expect(secondaryMembership).toContainText("✓");
    await expect(secondaryMembership).not.toContainText("メイン");

    const factionSelect = page.getByTestId("post-faction-select");
    await expect(factionSelect).toBeVisible();
    await factionSelect.selectOption({ label: "賛成（メイン）" });
    const yesBody = "E2E multiple faction yes";
    await mainPostContent.fill(yesBody);
    await page.getByTestId("main-post-submit").click();
    const yesPost = page.locator("article").filter({ hasText: yesBody }).first();
    await expect(yesPost).toBeVisible();
    await expect(yesPost).toContainText("賛成");

    await page.getByTestId("main-post-composer-open").click();
    await factionSelect.selectOption({ label: "反対" });
    const noBody = "E2E multiple faction no";
    await mainPostContent.fill(noBody);
    await page.getByTestId("main-post-submit").click();
    const noPost = page.locator("article").filter({ hasText: noBody }).first();
    await expect(noPost).toBeVisible();
    await expect(noPost).toContainText("反対");
    await expect(noPost).not.toContainText("← 賛成");
    await expect(yesPost).toContainText("賛成");

    await page.getByTestId("main-post-composer-open").click();
    await secondaryMembership.getByRole("button", { name: "解除" }).click();
    await expect(memberships.getByText("反対への所属を解除しますか？")).toBeVisible();
    await memberships.getByRole("button", { name: "解除する" }).click();
    await expect(memberships.locator("li").filter({ hasText: "反対" })).toHaveCount(0, { timeout: 10_000 });
    await expect(primaryMembership).toContainText("★");
    await expect(primaryMembership).toContainText("賛成");
    await expect(page.getByTestId("post-faction-select")).toHaveCount(0);

    await expect(noPost).toContainText("反対");
    await expect(noPost).not.toContainText("← 賛成");
    await expect(yesPost).toContainText("賛成");
  });
});
