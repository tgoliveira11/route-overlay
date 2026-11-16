import { expect, test } from "@playwright/test";

const SANTOS =
  "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("route-overlay-e2e-keep") !== "1") {
      window.localStorage.clear();
    }
  });
});

test("imports a Google Maps URL and shows the recovered stops", async ({ page }) => {
  await page.goto("/plan");
  await page.getByTestId("plan-url-input").fill(SANTOS);
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-origin")).toContainText("Santos");
  await expect(page.getByTestId("plan-destination")).toContainText("Montevideo");
  await expect(page.getByTestId("plan-missing")).toContainText("not encoded");
  await expect(page.getByTestId("plan-original-url")).toContainText("google.com/maps");
});

test("displays mock candidates, selects the non-default, and confirms it", async ({ page }) => {
  await openSantos(page);
  await page.getByTestId("plan-reconstruct-mock").click();
  await expect(page.getByTestId("plan-candidate-count")).toContainText("2 candidates");
  await expect(page.getByTestId("plan-mock-badge").first()).toContainText("MOCK");
  await page.getByTestId("plan-candidate-mock-b").click();
  await page.getByTestId("plan-confirm").click();
  await expect(page.getByTestId("plan-confirmed")).toContainText("mock");
  await expect(page.getByTestId("plan-confirmed")).toContainText("false");
  await expect(page.getByTestId("plan-friction")).toContainText("low");
});

test("plans synthetic stops only after confirmation", async ({ page }) => {
  await openSantos(page);
  await expect(page.getByTestId("plan-stops-locked")).toBeVisible();
  await page.getByTestId("plan-reconstruct-mock").click();
  await page.getByTestId("plan-confirm").click();
  await page.getByTestId("plan-generate-stops").click();
  await expect(page.getByTestId("plan-stop-results")).toContainText("not real businesses");
  await expect(page.getByTestId("plan-stop-results")).toContainText("straight-line");
  await expect(page.getByTestId("plan-stop-feasible")).toContainText("Not feasible");
});

test("blocks confirmation after a waypoint until the new draft is reconstructed", async ({ page }) => {
  await openSantos(page);
  await page.getByTestId("plan-reconstruct-mock").click();
  await expect(page.getByTestId("plan-confirm")).toBeEnabled();
  await page.getByTestId("plan-waypoint-input").fill("-33.6900, -53.4600");
  await page.getByTestId("plan-add-waypoint").click();
  await expect(page.getByTestId("plan-stale-geometry")).toContainText("Recalculate");
  await expect(page.getByTestId("plan-confirm")).toHaveCount(0);
  await page.getByTestId("plan-recalculate").click();
  await expect(page.getByTestId("plan-candidate-count")).toContainText("1 candidate");
  await expect(page.getByTestId("plan-confirm")).toBeEnabled();
  await page.getByTestId("plan-confirm").click();
  await expect(page.getByTestId("plan-confirmed")).toContainText("-33.6900");
  await expect(page.getByTestId("plan-confirmed")).toContainText("false");
});

test("does not keep a confirmation after another route is imported", async ({ page }) => {
  await openSantos(page);
  await page.getByTestId("plan-reconstruct-mock").click();
  await page.getByTestId("plan-confirm").click();
  await expect(page.getByTestId("plan-confirmed")).toContainText("Santos");
  await page.getByTestId("plan-scenario-B").click();
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-waypoints")).toContainText("waypoint");
  await expect(page.getByTestId("plan-confirmed")).toHaveCount(0);
  await page.evaluate(() => window.sessionStorage.setItem("route-overlay-e2e-keep", "1"));
  await page.reload();
  await expect(page.getByTestId("plan-url-input")).toHaveValue(/waypoints=/);
  await expect(page.getByTestId("plan-confirmed")).toHaveCount(0);
  await expect(page.getByTestId("plan-origin")).toHaveCount(0);
});

test("clears a confirmation when a later import fails", async ({ page }) => {
  await openSantos(page);
  await page.getByTestId("plan-reconstruct-mock").click();
  await page.getByTestId("plan-confirm").click();
  await expect(page.getByTestId("plan-confirmed")).toBeVisible();
  await page.getByTestId("plan-url-input").fill("not a url");
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-error")).toContainText("absolute URL");
  await expect(page.getByTestId("plan-confirmed")).toHaveCount(0);
  await expect(page.getByTestId("plan-friction")).toContainText("Actions after import: 0");
  await page.evaluate(() => window.sessionStorage.setItem("route-overlay-e2e-keep", "1"));
  await page.reload();
  await expect(page.getByTestId("plan-confirmed")).toHaveCount(0);
  await expect(page.getByTestId("plan-url-input")).toHaveValue("");
});

test("adds a waypoint and recalculates without inventing alternatives", async ({ page }) => {
  await openSantos(page);
  await page.getByTestId("plan-waypoint-input").fill("-33.6900, -53.4600");
  await page.getByTestId("plan-add-waypoint").click();
  await expect(page.getByTestId("plan-draft-list")).toContainText("-33.6900");
  await page.getByTestId("plan-recalculate").click();
  await expect(page.getByTestId("plan-no-alternatives")).toContainText("does not return alternative routes");
  await expect(page.getByTestId("plan-candidate-count")).toContainText("1 candidate");
});

test("explains missing alternatives for a waypoint fixture", async ({ page }) => {
  await page.goto("/plan");
  await page.getByTestId("plan-scenario-B").click();
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-waypoints")).toContainText("waypoint");
  await page.getByTestId("plan-reconstruct-mock").click();
  await expect(page.getByTestId("plan-no-alternatives")).toBeVisible();
  await expect(page.getByTestId("plan-candidate-mock-b")).toHaveCount(0);
});

test("keeps Google Routes disabled without credentials", async ({ page }) => {
  await page.goto("/plan");
  await expect(page.getByTestId("plan-reconstruct-live")).toBeDisabled();
  await expect(page.getByTestId("plan-live-disabled")).toContainText("not available");
});

test("rejects text that is not a URL", async ({ page }) => {
  await page.goto("/plan");
  await page.getByTestId("plan-url-input").fill("not a url");
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-error")).toContainText("absolute URL");
  await expect(page.getByTestId("plan-origin")).toHaveCount(0);
});

test("stays usable at a mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSantos(page);
  await page.getByTestId("plan-reconstruct-mock").click();
  await expect(page.getByTestId("plan-candidate-mock-a")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});

async function openSantos(page: import("@playwright/test").Page) {
  await page.goto("/plan");
  await page.getByTestId("plan-url-input").fill(SANTOS);
  await page.getByTestId("plan-parse").click();
  await expect(page.getByTestId("plan-origin")).toContainText("Santos");
}
