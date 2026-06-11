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

  // bump weight + reps with the steppers, then log
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Weight +" }).click();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Reps +" }).click();
  await page.getByRole("button", { name: /^LOG 7.5 × 5$/i }).click();

  // editor closes, row is compact-done, rest bar runs
  await expect(page.getByText("LOGGING SET")).toBeHidden();
  await expect(page.getByText(/7\.5kg×5/)).toBeVisible();
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
