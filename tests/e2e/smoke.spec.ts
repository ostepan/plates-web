import { test, expect } from "@playwright/test";

test("onboarding → workout → build a routine → ready to start", async ({ page }) => {
  await page.goto("/");

  // onboarding (3 pages)
  await expect(page.getByText("WELCOME · 01")).toBeVisible();
  await page.getByRole("button", { name: "NEXT" }).click();
  await page.getByRole("button", { name: "NEXT" }).click();
  await page.getByRole("button", { name: "GET STARTED" }).click();

  // workout empty state
  await expect(page.getByText("Build your", { exact: false })).toBeVisible();

  // create a routine and add an exercise (empty-state CTA)
  await page.getByRole("button", { name: "NEW ROUTINE", exact: true }).click();
  await expect(page).toHaveURL(/routine\/.+\/edit/); // waits for create + navigate
  await page.getByRole("button", { name: "ADD EXERCISE" }).click();
  await page.getByPlaceholder("Search exercises").fill("Bench Press");
  await page.getByText("Bench Press", { exact: true }).first().click();

  // save → routine detail → can start
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "START WORKOUT" })).toBeVisible();
});

test("tab bar navigates between surfaces", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("plates.hasCompletedOnboarding", "true"));
  await page.goto("/");

  await page.getByRole("link", { name: "Exercises" }).click();
  await expect(page).toHaveURL(/\/exercises/);
  await expect(page.getByPlaceholder("Search exercises")).toBeVisible();

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByRole("button", { name: "Plate Calculator" })).toBeVisible();
});
