import { expect, test } from "@playwright/test";

const user1Email = process.env.E2E_USER1_EMAIL;
const user1Password = process.env.E2E_USER1_PASSWORD;

test("派閥プリセットを一括適用し、形式ごとの制約と手動編集を維持する", async ({ page }) => {
  test.skip(!user1Email || !user1Password, "E2E_USER1 の認証情報が必要です");

  await page.goto("/login");
  await page.getByTestId("login-email").fill(user1Email!);
  await page.getByTestId("login-password").fill(user1Password!);
  await page.getByTestId("login-submit").click();
  await expect(page).toHaveURL(/\/mypage$/);

  await page.goto("/topics/new");
  const preset = page.getByTestId("faction-preset");
  const apply = page.getByTestId("apply-faction-preset");
  const inputs = page.getByTestId("faction-input-list").locator("input");

  await expect(preset).toBeDisabled();
  await expect(page.getByText("この討論形式では主催・参加者の2役割固定のため、派閥プリセットは使用できません。")).toBeVisible();

  await page.getByRole("button", { name: "優劣", exact: true }).click();
  for (const [id, count] of [["prefectures", 47], ["regions", 8], ["weekdays", 7], ["blood-types", 4], ["seasons", 4]] as const) {
    await preset.selectOption(id);
    if (id !== "prefectures") page.once("dialog", (dialog) => dialog.accept());
    await apply.click();
    await expect(inputs).toHaveCount(count);
  }

  await inputs.first().fill("新しい春");
  await expect(inputs.first()).toHaveValue("新しい春");
  await page.getByRole("button", { name: "＋ 派閥を追加" }).click();
  await expect(inputs).toHaveCount(5);
  await page.getByLabel("派閥5を削除").click();
  await expect(inputs).toHaveCount(4);

  await page.locator('[name="nameMode"][value="werewolf"]').check();
  await expect(inputs).toHaveCount(2);
  await expect(preset.locator('option[value="seasons"]')).toBeDisabled();
  await expect(apply).toBeDisabled();
});
