import { expect, test } from "@playwright/test";

test("shows the premium coverage diagnostic without calling Google", async ({ page }) => {
  await page.goto("/coverage");
  await expect(page.getByTestId("coverage-route")).toBeVisible();
  await expect(page.getByTestId("coverage-premium")).toBeVisible();
  await expect(page.getByTestId("coverage-within-2")).toBeVisible();
  await expect(page.getByTestId("coverage-within-5")).toBeVisible();
  await expect(page.getByTestId("coverage-warnings")).toBeVisible();
  await expect(page.getByTestId("coverage-map-status")).toContainText("not drawn");
});
