import { expect, test } from "@playwright/test";
import { createFutureEndSetting, getCreatedTopicSlug, login, waitForTopicEnd } from "./helpers/slow-topic";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;
const credentialsMissing = !email || !password;

test.describe("@slow 人狼の終了後正体公開", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");

  test("after_endでは討論中は非公開、終了後だけ人格ペアを公開する", async ({ page }) => {
    test.setTimeout(240_000);

    await login(page, email!, password!);

    await page.goto("/topics/new");
    const topicTitle = `[E2E] Werewolf Reveal ${Date.now()}`;
    const endSetting = await createFutureEndSetting(page);
    await page.locator('[name="title"]').fill(topicTitle);
    await page.locator('[name="content"]').fill("E2E werewolf reveal topic content");
    await page.locator('[name="debateType"]').selectOption("superiority");
    await page.locator('[name="nameMode"][value="werewolf"]').check();
    await page.locator('[name="werewolfRevealMode"][value="after_end"]').check();
    await page.locator('[name="endsAt"]').fill(endSetting.input);
    await page.getByTestId("topic-create-submit").click();

    const slug = await getCreatedTopicSlug(page, topicTitle);
    await expect(page.getByText("正体は討論終了後に公開されます。", { exact: true })).toBeVisible();

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
    const factionSelect = page.getByTestId("post-faction-select");

    const yesBody = "E2E reveal yes";
    await mainPostContent.fill(yesBody);
    await page.getByTestId("main-post-submit").click();
    const yesPost = page.locator("article").filter({ hasText: yesBody }).first();
    await expect(yesPost).toContainText(alias1);
    await expect(yesPost).toContainText("賛成");

    await page.getByTestId("main-post-composer-open").click();
    await factionSelect.selectOption({ label: "反対" });
    const noBody = "E2E reveal no";
    await mainPostContent.fill(noBody);
    await page.getByTestId("main-post-submit").click();
    const noPost = page.locator("article").filter({ hasText: noBody }).first();
    await expect(noPost).toContainText(alias2);
    await expect(noPost).toContainText("反対");

    await expect(page.getByRole("heading", { name: "人狼 正体公開" })).toHaveCount(0);
    await expect(page.getByText("⇅ 同一参加者", { exact: true })).toHaveCount(0);

    await waitForTopicEnd(page, slug, endSetting.timestamp);
    await page.goto(`/records/${encodeURIComponent(slug)}`);
    await expect(page).toHaveURL(new RegExp(`/records/${slug}$`));
    await expect(page.getByText("● 討論終了", { exact: true })).toBeVisible();
    const revealSection = page.getByRole("heading", { name: "人狼 正体公開" }).locator("xpath=ancestor::section[1]");
    await expect(revealSection).toBeVisible();
    const pairCard = revealSection.locator("article").filter({ hasText: alias1 }).filter({ hasText: alias2 });
    await expect(pairCard).toBeVisible();
    await expect(pairCard).toContainText("賛成");
    await expect(pairCard).toContainText("反対");
    await expect(pairCard).toContainText("同一参加者");

    const normalizedPairText = (await pairCard.innerText()).replace(/\s+/g, " ").trim();
    expect(normalizedPairText).toBe(`${alias1} ［賛成］ ⇅ 同一参加者 ${alias2} ［反対］`);
    const emailIsExposed = await revealSection.evaluate((section, value) => section.textContent?.includes(String(value)) ?? false, email!);
    expect(emailIsExposed).toBe(false);
    await expect(revealSection.getByText("user_id", { exact: false })).toHaveCount(0);
    await expect(revealSection.getByText("topic_member_id", { exact: false })).toHaveCount(0);
  });
});
