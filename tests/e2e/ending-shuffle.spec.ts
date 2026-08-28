import { expect, test } from "@playwright/test";

const email = process.env.E2E_USER1_EMAIL;
const password = process.env.E2E_USER1_PASSWORD;

test("終了日時の初期値、白黒制約、シャッフルの一度だけの割当を確認する", async ({ page }) => {
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);
  await page.goto("/topics/new");

  await expect(page.getByTestId("topic-ends-at")).not.toHaveValue("");
  const deadlineValue = await page.getByTestId("topic-ends-at").inputValue();
  const deadline = new Date(deadlineValue).getTime();
  expect(deadline - Date.now()).toBeGreaterThan(71 * 60 * 60 * 1000);
  expect(deadline - Date.now()).toBeLessThan(73 * 60 * 60 * 1000);
  expect(new Date(await page.getByTestId("topic-ends-at").getAttribute("max") ?? "").getTime() - Date.now()).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
  await expect(page.getByText("現在から2週間以内で指定できます。", { exact: false })).toBeVisible();

  await page.locator('[name="endMode"][value="inactivity"]').check();
  await expect(page.getByText("設定可能範囲：10分 ～ 7日", { exact: false })).toBeVisible();
  await expect(page.getByTestId("inactivity-value")).toHaveAttribute("min", "10");
  await expect(page.getByTestId("inactivity-value")).toHaveAttribute("max", "50");
  await page.getByTestId("inactivity-unit").selectOption("days");
  await expect(page.getByTestId("inactivity-value")).toHaveAttribute("min", "1");
  await expect(page.getByTestId("inactivity-value")).toHaveAttribute("max", "7");
  await page.locator('[name="endMode"][value="fixed"]').check();

  await page.locator('[name="debateType"]').selectOption("binary");
  await expect(page.locator('[name="allowMultipleFactions"]')).toBeDisabled();
  await expect(page.locator('[name="allowMultipleFactions"]')).not.toBeChecked();
  await page.getByRole("button", { name: "＋ 派閥を追加" }).click();
  await page.getByRole("button", { name: "＋ 派閥を追加" }).click();
  await expect(page.getByLabel("派閥4を削除")).toBeEnabled();
  await page.getByLabel("派閥4を削除").click();
  await page.getByLabel("派閥3を削除").click();

  await page.locator('[name="debateType"]').selectOption("superiority");
  await page.getByTestId("shuffle-factions").check();
  await expect(page.locator('[name="allowFactionChange"]')).toBeDisabled();
  await expect(page.locator('[name="allowMultipleFactions"]')).toBeDisabled();
  await expect(page.locator('[name="allowFactionAddition"]')).toBeDisabled();
  await page.locator('[name="nameMode"][value="werewolf"]').click();
  await expect(page.locator('[name="nameMode"][value="werewolf"]')).not.toBeChecked();

  const title = `[E2E] Shuffle ${Date.now()}`;
  await page.locator('[name="title"]').fill(title);
  await page.locator('[name="content"]').fill("E2E shuffle topic");
  await page.getByTestId("topic-create-submit").click();
  await expect(page).toHaveURL(/\/topics\/(?!new(?:$|[/?#]))[^/?#]+$/);
  const currentFaction = (await page.getByTestId("participant-current-faction").first().textContent())?.trim();
  expect(["賛成", "反対"]).toContain(currentFaction);
  await page.reload();
  await expect(page.getByTestId("participant-current-faction").first()).toHaveText(currentFaction!);
});

test("白黒を3派閥・4派閥で作成でき、1派閥には減らせない", async ({ page }) => {
  test.skip(!email || !password, "E2E_USER1_EMAIL / E2E_USER1_PASSWORD が必要です");
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email!);
  await page.getByTestId("login-password").fill(password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);

  for (const factionCount of [3, 4]) {
    await page.goto("/topics/new");
    await page.locator('[name="debateType"]').selectOption("binary");
    await expect(page.getByLabel("派閥1を削除")).toBeDisabled();
    await expect(page.getByLabel("派閥2を削除")).toBeDisabled();
    for (let index = 2; index < factionCount; index += 1) {
      await page.getByRole("button", { name: "＋ 派閥を追加" }).click();
      await page.getByLabel(`派閥 ${index + 1}`).fill(`${String.fromCharCode(65 + index)}案`);
    }
    const title = `[E2E] Binary ${factionCount} Factions ${Date.now()}`;
    await page.locator('[name="title"]').fill(title);
    await page.locator('[name="content"]').fill(`${factionCount}派閥の白黒作成確認`);
    await page.getByTestId("topic-create-submit").click();
    await expect(page).toHaveURL(/\/topics\/(?!new(?:$|[/?#]))[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
});
