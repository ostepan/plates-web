import { test, expect } from "@playwright/test";

test("tap set → editor → log → rest bar + floating timer", async ({ page }) => {
  await page.goto("/");

  // onboarding
  await page.getByRole("button", { name: "NEXT" }).click();
  await page.getByRole("button", { name: "NEXT" }).click();
  await page.getByRole("button", { name: "GET STARTED" }).click();

  // build a routine with one exercise
  await page.getByRole("button", { name: "NEW ROUTINE", exact: true }).click();
  await expect(page).toHaveURL(/routine\/.+\/edit/);
  await page.getByRole("button", { name: "ADD EXERCISE" }).click();
  await page.getByPlaceholder("Search exercises").fill("Bench Press");
  await page.getByText("Bench Press", { exact: true }).first().click();
  await page.getByRole("button", { name: "Save" }).click();

  // start the workout
  await page.getByRole("button", { name: "START WORKOUT" }).click();
  await expect(page).toHaveURL(/\/active\//);

  // tap the first pending set row → dark editor opens
  await page.locator("[role=button]").filter({ hasText: "—" }).first().click();
  await expect(page.getByText("LOGGING SET")).toBeVisible();

  // type weight + reps, pick RIR from the dropdown sheet, then log
  await page.locator('input[inputmode="decimal"]').fill("7.5");
  await page.locator('input[inputmode="numeric"]').fill("5");
  await page.locator('button[aria-haspopup="dialog"]').click();
  await page.getByRole("dialog").getByRole("option").filter({ hasText: "very hard" }).click();
  await page.getByRole("button", { name: /^LOG 7.5 × 5$/i }).click();

  // editor closes, row is compact-done, rest bar runs
  await expect(page.getByText("LOGGING SET")).toBeHidden();
  await expect(page.getByText(/7\.5kg×5/)).toBeVisible();
  await expect(page.getByText("RIR 1", { exact: true })).toBeVisible();
  await expect(page.getByText("REST", { exact: true })).toBeVisible();

  // navigate away mid-rest → floating timer pill appears, tap returns to workout
  await page.goBack();
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.getByRole("button", { name: "Rest timer — back to workout" })).toBeVisible();
  await page.getByRole("button", { name: "Rest timer — back to workout" }).click();
  await expect(page).toHaveURL(/\/active\//);

  // tap the done row → revise editor
  await page.getByText(/7\.5kg×5/).click();
  await expect(page.getByText("REVISE SET")).toBeVisible();
});
