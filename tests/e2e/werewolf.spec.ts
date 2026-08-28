import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("人狼記名モード", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("立場ごとの別人格で投稿し、通常の派閥管理UIを表示しない", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/login");
    await page.getByTestId("login-email").fill(email!);
    await page.getByTestId("login-password").fill(password!);
    await page.getByTestId("login-submit").click();
    await expect(page).toHaveURL(/\/mypage$/);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Werewolf ${Date.now()}`;
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E werewolf topic content");
    await page.locator('[name="debateType"]').selectOption("superiority");
    const werewolfMode = page.locator('[name="nameMode"][value="werewolf"]');
    await expect(werewolfMode).toBeEnabled();
    await werewolfMode.check();
    await expect(werewolfMode).toBeChecked();
    await expect(page.locator('[name="werewolfRevealMode"][value="never"]')).toBeChecked();

    const factionSection = page.getByRole("heading", { name: "派閥", exact: true }).locator("xpath=ancestor::section[1]");
    await expect(factionSection.locator('input:not([name="shuffleFactions"])')).toHaveCount(2);
    await expect(factionSection.getByRole("button", { name: "＋ 派閥を追加" })).toHaveCount(0);
    await expect(page.locator('[name="allowFactionChange"]')).toBeDisabled();
    await expect(page.locator('[name="allowMultipleFactions"]')).toBeDisabled();
    await expect(page.locator('[name="allowFactionAddition"]')).toBeDisabled();

    await page.getByTestId("topic-create-submit").click();
    await expect(page).toHaveURL(/\/topics\/[^/]+$/);
    await expect(page.getByRole("heading", { name: topicTitle })).toBeVisible();
    await expect(page.getByText("永久に非公開", { exact: true })).toBeVisible();

    const alias1Input = page.getByTestId("werewolf-alias-1");
    const alias2Input = page.getByTestId("werewolf-alias-2");
    await expect(alias1Input).toHaveValue(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    await expect(alias2Input).toHaveValue(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    const alias1 = await alias1Input.inputValue();
    const alias2 = await alias2Input.inputValue();
    expect(alias1).not.toBe(alias2);

    await page.getByTestId("werewolf-primary-faction").selectOption({ label: "賛成" });
    await page.getByTestId("werewolf-join-submit").click();
    const mainPostContent = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(mainPostContent).toBeVisible({ timeout: 10_000 });
    const composer = mainPostContent.locator("xpath=ancestor::form[1]");
    const factionSelect = page.getByTestId("post-faction-select");
    await expect(factionSelect).toHaveValue(/.+/);
    await expect(composer).toContainText(`発言名：${alias1}`);

    const yesBody = "E2E werewolf yes post";
    await mainPostContent.fill(yesBody);
    await page.getByTestId("main-post-submit").click();
    const yesPost = page.locator("article").filter({ hasText: yesBody }).first();
    await expect(yesPost).toBeVisible();
    await expect(yesPost).toContainText(alias1);
    await expect(yesPost).toContainText("賛成");
    await expect(yesPost).not.toContainText("←");

    await page.getByTestId("main-post-composer-open").click();
    await factionSelect.selectOption({ label: "反対" });
    await expect(composer).toContainText(`発言名：${alias2}`);
    const noBody = "E2E werewolf no post";
    await mainPostContent.fill(noBody);
    await page.getByTestId("main-post-submit").click();
    const noPost = page.locator("article").filter({ hasText: noBody }).first();
    await expect(noPost).toBeVisible();
    await expect(noPost).toContainText(alias2);
    await expect(noPost).toContainText("反対");
    await expect(noPost).not.toContainText("← 賛成");
    expect(alias1).not.toBe(alias2);

    await expect(page.getByTestId("faction-change-open")).toHaveCount(0);
    await expect(page.getByTestId("member-factions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "＋ 所属派閥を追加" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "＋ 派閥を追加" })).toHaveCount(0);
    await expect(page.getByText("user_id", { exact: false })).toHaveCount(0);
    await expect(page.getByText("topic_member_id", { exact: false })).toHaveCount(0);
    const emailIsExposed = await page.locator("body").evaluate((body, value) => body.textContent?.includes(String(value)) ?? false, email!);
    expect(emailIsExposed).toBe(false);
  });
});
