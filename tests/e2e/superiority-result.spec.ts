import { expect, test } from "@playwright/test";
import { createFutureEndSetting, getCreatedTopicSlug, login, waitForTopicEnd } from "./helpers/slow-topic";

const user1Email = process.env.E2E_USER1_EMAIL;
const user1Password = process.env.E2E_USER1_PASSWORD;
const user2Email = process.env.E2E_USER2_EMAIL;
const user2Password = process.env.E2E_USER2_PASSWORD;
const credentialsMissing = !user1Email || !user1Password || !user2Email || !user2Password;

test.describe("@slow 優劣の公式最終結果", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD / E2E_USER2_EMAIL / E2E_USER2_PASSWORD が必要です");

  test("終了時点のリアクションポイントを確定し、終了後の評価では変化しない", async ({ browser, page }) => {
    test.setTimeout(480_000);
    await login(page, user1Email!, user1Password!);

    await page.goto("/topics/new");
    const title = `[E2E] Superiority Result ${Date.now()}`;
    const endSetting = await createFutureEndSetting(page, 240_000);
    await page.locator('[name="title"]').fill(title);
    await page.locator('[name="content"]').fill("E2E superiority result topic content");
    await page.locator('[name="debateType"]').selectOption("superiority");
    await page.locator('[name="endsAt"]').fill(endSetting.input);
    await page.getByTestId("topic-create-submit").click();
    const slug = await getCreatedTopicSlug(page, title);

    await page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
    await page.getByTestId("join-topic-submit").click();
    const user1Composer = page.getByTestId("main-post-content");
    await page.getByTestId("main-post-composer-open").click();
    await expect(user1Composer).toBeVisible({ timeout: 10_000 });
    const yesBody = "E2E superiority yes";
    await user1Composer.fill(yesBody);
    await page.getByTestId("main-post-submit").click();
    await expect(page.locator("article").filter({ hasText: yesBody }).first()).toBeVisible();

    const user2Context = await browser.newContext({ baseURL: "http://localhost:3000", timezoneId: "Asia/Tokyo" });
    const user2Page = await user2Context.newPage();
    try {
      await login(user2Page, user2Email!, user2Password!);
      await user2Page.goto(`/topics/${encodeURIComponent(slug)}`);
      await user2Page.getByTestId("join-faction-select").selectOption({ label: "反対" });
      await user2Page.getByTestId("join-topic-submit").click();
      const user2Composer = user2Page.getByTestId("main-post-content");
      await user2Page.getByTestId("main-post-composer-open").click();
      await expect(user2Composer).toBeVisible({ timeout: 10_000 });
      const noBody = "E2E superiority no";
      await user2Composer.fill(noBody);
      await user2Page.getByTestId("main-post-submit").click();
      const noPostForUser2 = user2Page.locator("article").filter({ hasText: noBody }).first();
      await expect(noPostForUser2).toBeVisible();

      const yesPostForUser2 = user2Page.locator("article").filter({ hasText: yesBody }).first();
      await yesPostForUser2.hover();
      const yesReaction = yesPostForUser2.getByRole("button", { name: /^納得\s/ });
      await yesReaction.evaluate((button: HTMLButtonElement) => button.click());
      await expect(yesReaction).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });

      await expect(page.getByRole("heading", { name: "優劣結果" })).toHaveCount(0);
      await waitForTopicEnd(page, slug, endSetting.timestamp);
      await page.goto(`/records/${encodeURIComponent(slug)}`);
      const resultSection = page.getByRole("heading", { name: "優劣結果" }).locator("xpath=ancestor::section[1]");
      await expect(resultSection).toBeVisible();
      const yesResult = resultSection.locator("article").filter({ hasText: "賛成" });
      const noResult = resultSection.locator("article").filter({ hasText: "反対" });
      await expect(yesResult).toContainText("2pt");
      await expect(noResult).toContainText("0pt");
      await expect(resultSection).toContainText("最優勢：賛成");

      const noRecordPost = page.locator("article").filter({ hasText: noBody }).first();
      await noRecordPost.hover();
      const noReaction = noRecordPost.getByRole("button", { name: /^納得\s/ });
      await noReaction.evaluate((button: HTMLButtonElement) => button.click());
      await expect(noReaction).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
      await page.reload();
      const reloadedResult = page.getByRole("heading", { name: "優劣結果" }).locator("xpath=ancestor::section[1]");
      await expect(reloadedResult.locator("article").filter({ hasText: "賛成" })).toContainText("2pt");
      await expect(reloadedResult.locator("article").filter({ hasText: "反対" })).toContainText("0pt");
      await expect(reloadedResult).toContainText("最優勢：賛成");
    } finally {
      await user2Context.close();
    }
  });
});
