import { expect, test } from "@playwright/test";

test("imports a named route, reconstructs it in mock mode, and keeps Google disabled", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "route that was selected",
  );
  await expect(page.getByTestId("mode-badge")).toContainText("Mock reconstruction");

  await page.getByTestId("sample-congonhas-masp").click();
  await page.getByTestId("parse-button").click();

  await expect(page.getByTestId("stop-origin")).toContainText("Congonhas Airport");
  await expect(page.getByTestId("stop-waypoint")).toContainText("Mercado Municipal");
  await expect(page.getByTestId("stop-destination")).toContainText("MASP");
  await expect(page.getByTestId("selected-route")).toContainText("not preserved");
  await expect(page.getByTestId("field-encoded-polyline")).toContainText("not encoded");
  await expect(page.getByTestId("field-selected-alternative")).toContainText("not encoded");
  await expect(page.getByTestId("reconstruct-live")).toBeDisabled();

  await page.getByTestId("reconstruct-mock").click();
  await expect(page.getByTestId("mock-banner")).toContainText("MOCK");
  await expect(page.getByTestId("mock-banner")).not.toContainText("LIVE — Google Routes API");
  await expect(page.getByTestId("fidelity-verdict")).toContainText("not preserved");
  await expect(page.getByTestId("provenance")).toContainText("local sample fixture");
  await expect(page.getByText("MOCK GEOMETRY")).toBeVisible();
});

test("pasted coordinate URL shows recovered points and a constrained verdict", async ({
  page,
}) => {
  await page.goto("/");
  const url =
    "https://www.google.com/maps/dir/?api=1&origin=-23.5614,-46.6558&destination=-23.6261,-46.6563&waypoints=via:-23.5900,-46.6400&travelmode=driving";
  await page.getByTestId("url-input").fill(url);
  await page.getByTestId("parse-button").click();

  await expect(page.getByTestId("stop-origin")).toContainText("-23.5614");
  await expect(page.getByTestId("stop-waypoint")).toContainText("via");
  await expect(page.getByTestId("stop-destination")).toContainText("-23.6261");
  await expect(page.getByTestId("field-coordinates")).toContainText("recovered");

  await page.getByTestId("reconstruct-mock").click();
  await expect(page.getByTestId("fidelity-verdict")).toContainText("not preserved");
  await expect(page.getByTestId("fidelity-verdict")).toContainText("constrain");
  await expect(page.getByTestId("provenance")).toContainText("not a road geometry");
});

test("rejects text that is not a URL", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("url-input").fill("not a url");
  await page.getByTestId("parse-button").click();
  await expect(page.getByTestId("error")).toContainText("absolute URL");
  await expect(page.getByTestId("stop-origin")).toHaveCount(0);
});

test("mobile width completes the import without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByTestId("sample-pinheiros-ibirapuera").click();
  await page.getByTestId("parse-button").click();
  await expect(page.getByTestId("stop-origin")).toContainText("Pinheiros");
  await expect(page.getByTestId("stop-destination")).toContainText("Ibirapuera");
  await expect(page.getByTestId("field-travel-mode")).toContainText("partial");
  await page.getByTestId("reconstruct-mock").click();
  await expect(page.getByTestId("mock-banner")).toBeVisible();
  await expect(page.getByText("No coordinates were available")).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(overflow).toBe(false);
});

test("renders the feasibility report", async ({ page }) => {
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: "Hypothesis H1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hypothesis H2" })).toBeVisible();
  await expect(page.getByText("not supported").first()).toBeVisible();
});
