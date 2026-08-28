import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { getCreatedTopicSlug, login } from "./helpers/slow-topic";

const appEnvironment = parseEnv(readFileSync(resolve(process.cwd(), ".env.local"), "utf8"));
const supabaseUrl = appEnvironment.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = appEnvironment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const user1Email = process.env.E2E_USER1_EMAIL;
const user1Password = process.env.E2E_USER1_PASSWORD;
const user2Email = process.env.E2E_USER2_EMAIL;
const user2Password = process.env.E2E_USER2_PASSWORD;
const credentialsMissing = !supabaseUrl || !supabaseKey || !user1Email || !user1Password || !user2Email || !user2Password;

async function fillBinaryTopic(page: import("@playwright/test").Page, title: string) {
  await page.goto("/topics/new");
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="content"]').fill("E2E binary live vote topic content");
  await page.locator('[name="debateType"]').selectOption("binary");
}

test.describe("白黒の討論中票数", () => {
  test.skip(credentialsMissing, "Supabase公開設定とE2E USER1/USER2認証情報が必要です");

  test("default非公開はUIとanon/authenticated RPCの両方で途中票数を隠す", async ({ page }) => {
    test.setTimeout(90_000);
    await login(page, user1Email!, user1Password!);
    const title = `[E2E] Binary Hidden Votes ${Date.now()}`;
    await fillBinaryTopic(page, title);
    await expect(page.getByTestId("binary-live-vote-setting")).toBeVisible();
    await expect(page.getByRole("radio", { name: /終了まで非公開/ })).toBeChecked();
    await page.getByTestId("topic-create-submit").click();
    const slug = await getCreatedTopicSlug(page, title);
    await expect(page.getByTestId("binary-live-vote-summary")).toContainText("票数は討論終了まで非公開です。");

    const anon = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
    const topicResult = await anon.from("topics").select("id").eq("slug", slug).single();
    expect(topicResult.error).toBeNull();
    const topicId = String(topicResult.data!.id);
    const ruleResult = await anon.from("topic_rules").select("show_live_vote_counts").eq("topic_id", topicId).single();
    expect(ruleResult.error).toBeNull();
    expect(ruleResult.data?.show_live_vote_counts).toBe(false);

    const anonVotes = await anon.rpc("get_binary_final_result", { p_topic_id: topicId });
    const anonFactionSummary = await anon.rpc("get_topic_faction_summary", { p_topic_id: topicId });
    expect(anonVotes.error).toBeNull();
    expect(anonVotes.data).toEqual([]);
    expect(anonFactionSummary.error).toBeNull();
    expect(anonFactionSummary.data).toEqual([]);

    const authenticated = createClient(supabaseUrl!, supabaseKey!, { auth: { persistSession: false } });
    const signIn = await authenticated.auth.signInWithPassword({ email: user1Email!, password: user1Password! });
    expect(signIn.error).toBeNull();
    const authenticatedVotes = await authenticated.rpc("get_binary_final_result", { p_topic_id: topicId });
    expect(authenticatedVotes.error).toBeNull();
    expect(authenticatedVotes.data).toEqual([]);
  });

  test("公開ONの3派閥では現在のprimary factionを表示し、派閥移動後に更新する", async ({ browser, page }) => {
    test.setTimeout(90_000);
    await login(page, user1Email!, user1Password!);
    const title = `[E2E] Binary Live Votes ${Date.now()}`;
    await fillBinaryTopic(page, title);
    await page.getByRole("radio", { name: /公開する/ }).check();
    await page.getByRole("button", { name: "＋ 派閥を追加" }).click();
    await page.getByLabel("派閥 3").fill("保留");
    await expect(page.getByText("途中票数").last()).toBeVisible();
    await expect(page.getByText("公開", { exact: true }).last()).toBeVisible();
    await page.getByTestId("topic-create-submit").click();
    const slug = await getCreatedTopicSlug(page, title);

    await page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
    await page.getByTestId("join-topic-submit").click();
    await expect(page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });

    const user2Context = await browser.newContext({ baseURL: "http://localhost:3000", timezoneId: "Asia/Tokyo" });
    const user2Page = await user2Context.newPage();
    try {
      await login(user2Page, user2Email!, user2Password!);
      await user2Page.goto(`/topics/${encodeURIComponent(slug)}`);
      await user2Page.getByTestId("join-faction-select").selectOption({ label: "賛成" });
      await user2Page.getByTestId("join-topic-submit").click();
      await expect(user2Page.getByTestId("main-post-composer-open")).toBeVisible({ timeout: 10_000 });

      await page.reload();
      const liveSummary = page.getByTestId("binary-live-vote-summary");
      await expect(liveSummary.getByTestId("binary-live-vote-row").filter({ hasText: "賛成" })).toContainText("2人");
      await expect(liveSummary.getByTestId("binary-live-vote-row").filter({ hasText: "反対" })).toContainText("0人");
      await expect(liveSummary.getByTestId("binary-live-vote-row").filter({ hasText: "保留" })).toContainText("0人");

      await user2Page.getByTestId("main-post-composer-open").click();
      await expect(user2Page.getByTestId("faction-change-open")).toBeVisible();
      await user2Page.getByTestId("faction-change-open").click();
      await user2Page.getByTestId("faction-change-select").selectOption({ label: "反対" });
      await user2Page.getByRole("button", { name: "派閥を変更", exact: true }).click();
      await user2Page.getByTestId("faction-change-submit").click();
      await expect(user2Page.getByTestId("faction-change-open")).toBeVisible({ timeout: 10_000 });

      await page.reload();
      await expect(liveSummary.getByTestId("binary-live-vote-row").filter({ hasText: "賛成" })).toContainText("1人");
      await expect(liveSummary.getByTestId("binary-live-vote-row").filter({ hasText: "反対" })).toContainText("1人");
    } finally {
      await user2Context.close();
    }
  });
});
