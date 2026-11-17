import { expect, test } from "@playwright/test";

test("shows measured detours without calling Google", async ({ page }) => {
  await page.goto("/detours");
  await expect(page.getByTestId("detour-disclaimer")).toContainText("does not call Google");
  await expect(page.getByTestId("detour-table")).toBeVisible();
  await expect(page.getByText("Not measured").first()).toBeVisible();
  await expect(page.getByText("POSTO 4 IRMAOS JL LTDA")).toBeVisible();
});
