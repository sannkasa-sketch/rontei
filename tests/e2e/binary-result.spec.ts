import { expect, test } from "@playwright/test";
import { createFutureEndSetting, getCreatedTopicSlug, login, waitForTopicEnd } from "./helpers/slow-topic";

const user1Email = process.env.E2E_USER1_EMAIL;
const user1Password = process.env.E2E_USER1_PASSWORD;
const user2Email = process.env.E2E_USER2_EMAIL;
const user2Password = process.env.E2E_USER2_PASSWORD;
const credentialsMissing = !user1Email || !user1Password || !user2Email || !user2Password;

test.describe("@slow 白黒の公式最終結果", () => {
  test.skip(credentialsMissing, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD / E2E_USER2_EMAIL / E2E_USER2_PASSWORD が必要です");

  test("終了時点のメイン派閥を1人1票として集計する", async ({ browser, page }) => {
    test.setTimeout(240_000);
    await login(page, user1Email!, user1Password!);

    await page.goto("/topics/new");
    const title = `[E2E] Binary Result ${Date.now()}`;
    const endSetting = await createFutureEndSetting(page);
    await page.locator('[name="title"]').fill(title);
    await page.locator('[name="content"]').fill("E2E binary result topic content");
    await page.locator('[name="debateType"]').selectOption("binary");
    await page.locator('[name="endsAt"]').fill(endSetting.input);
    await page.getByTestId("topic-create-submit").click();
    const slug = await getCreatedTopicSlug(page, title);

    await page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
    await page.getByTestId("join-topic-submit").click();
    await page.getByTestId("main-post-composer-open").click();
    await expect(page.getByTestId("main-post-content")).toBeVisible({ timeout: 10_000 });

    const user2Context = await browser.newContext({ baseURL: "http://localhost:3000", timezoneId: "Asia/Tokyo" });
    const user2Page = await user2Context.newPage();
    try {
      await login(user2Page, user2Email!, user2Password!);
      await user2Page.goto(`/topics/${encodeURIComponent(slug)}`);
      await user2Page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
      await user2Page.getByTestId("join-topic-submit").click();
      await user2Page.getByTestId("main-post-composer-open").click();
      await expect(user2Page.getByTestId("main-post-content")).toBeVisible({ timeout: 10_000 });

      await user2Page.getByTestId("faction-change-open").click();
      await user2Page.getByTestId("faction-change-select").selectOption({ label: "反対" });
      await user2Page.getByRole("button", { name: "派閥を変更", exact: true }).click();
      await user2Page.getByTestId("faction-change-submit").click();
      const membershipPanel = user2Page.getByTestId("faction-change-open").locator("xpath=ancestor::section[1]");
      await expect(membershipPanel).toContainText("現在の派閥：反対", { timeout: 10_000 });

      await expect(page.getByRole("heading", { name: "最終多数決" })).toHaveCount(0);
      await waitForTopicEnd(page, slug, endSetting.timestamp);
      await page.goto(`/records/${encodeURIComponent(slug)}`);

      const resultSection = page.getByRole("heading", { name: "最終多数決" }).locator("xpath=ancestor::section[1]");
      await expect(resultSection).toBeVisible();
      const yesResult = resultSection.locator("article").filter({ hasText: "賛成" });
      const noResult = resultSection.locator("article").filter({ hasText: "反対" });
      await expect(yesResult).toContainText("1票");
      await expect(noResult).toContainText("1票");
      await expect(resultSection).toContainText("結果：引き分け");
    } finally {
      await user2Context.close();
    }
  });
});
