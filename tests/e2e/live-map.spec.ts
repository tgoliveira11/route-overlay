import { expect, test, type Page, type Route } from "@playwright/test";

const SANTOS =
  "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0";

test("loads a mocked Google map, switches candidates, and blocks a failed map", async ({ page }) => {
  let mapLoads = 0;
  await page.route("**/api/routes/status", async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        configured: true,
        liveAvailable: true,
        reason: "E2E fixture. No Google request is sent.",
        mapsDisplayAvailable: true,
        mapsJsKey: "e2e-maps-not-real",
      },
    });
  });
  await page.route("**/api/routes/map-load", async (route) => {
    mapLoads += 1;
    await route.fulfill({ json: { allowed: true, reason: null, mapLoads, computeRoutesCalls: 0 } });
  });
  await page.route("**/api/routes/reconstruct", async (route) => {
    await fulfillReconstruction(route);
  });
  await page.route("**/maps/api/js**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: fakeMapsScript(),
    });
  });

  await page.goto("/plan");
  await page.getByTestId("plan-url-input").fill(SANTOS);
  await page.getByTestId("plan-parse").click();
  await page.getByTestId("plan-reconstruct-live").click();
  await expect(page.getByTestId("plan-google-map")).toBeVisible();
  await expect(page.getByTestId("plan-google-map-summary")).toContainText("1900.0 km");
  await expect(page.getByTestId("plan-confirm")).toBeEnabled();
  const loadsBeforeSwitch = mapLoads;
  await page.getByTestId("plan-candidate-google-2").click();
  await expect(page.getByTestId("plan-google-map-summary")).toContainText("2050.0 km");
  await expect(page.getByTestId("plan-confirm")).toBeEnabled();
  expect(mapLoads).toBe(loadsBeforeSwitch);

  await page.getByTestId("plan-waypoint-input").fill("-33.6900, -53.4600");
  await page.getByTestId("plan-add-waypoint").click();
  await expect(page.getByTestId("plan-stale-geometry")).toBeVisible();
  await expect(page.getByTestId("plan-confirm")).toHaveCount(0);
});

test("shows a map failure and keeps confirmation disabled", async ({ page }) => {
  await page.route("**/api/routes/status", async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        configured: true,
        liveAvailable: true,
        reason: "E2E fixture.",
        mapsDisplayAvailable: true,
        mapsJsKey: "e2e-maps-not-real",
      },
    });
  });
  await page.route("**/api/routes/map-load", async (route) => {
    await route.fulfill({ json: { allowed: true, reason: null, mapLoads: 1, computeRoutesCalls: 0 } });
  });
  await page.route("**/api/routes/reconstruct", async (route) => {
    await fulfillReconstruction(route);
  });
  await page.route("**/maps/api/js**", (route) => route.abort());

  await openLive(page);
  await expect(page.getByTestId("plan-google-map-error")).toContainText("did not load");
  await expect(page.getByTestId("plan-confirm")).toBeDisabled();
});

test("keeps live confirmation blocked when the map key is missing", async ({ page }) => {
  await page.route("**/api/routes/status", async (route) => {
    await route.fulfill({
      json: {
        enabled: true,
        configured: true,
        liveAvailable: true,
        reason: "Routes key present in the fixture only.",
        mapsDisplayAvailable: false,
        mapsJsKey: null,
      },
    });
  });
  await page.route("**/api/routes/reconstruct", async (route) => {
    await fulfillReconstruction(route);
  });
  await openLive(page);
  await expect(page.getByTestId("plan-live-confirm-blocked")).toBeVisible();
  await expect(page.getByTestId("plan-confirm")).toBeDisabled();
});

test("real provider smoke stays skipped unless the experiment flag is set", async () => {
  test.skip(
    process.env.ROUTE_OVERLAY_LIVE_EXPERIMENT !== "true",
    "Paid Google calls are outside the default browser suite.",
  );
});

async function openLive(page: Page) {
  await page.goto("/plan");
  await page.getByTestId("plan-url-input").fill(SANTOS);
  await page.getByTestId("plan-parse").click();
  await page.getByTestId("plan-reconstruct-live").click();
}

async function fulfillReconstruction(route: Route) {
  await route.fulfill({
    json: {
      parsed: { inputUrl: SANTOS, normalizedUrl: SANTOS, stops: [] },
      reconstruction: {
        source: "google_routes_api",
        mock: false,
        label: "LIVE — Google Routes API",
        disclaimer: "E2E fixture. This response did not come from Google.",
        geometryProvenance: "google_routes_polyline",
        provenanceNote: "Fixture polyline for the browser test.",
        routes: [
          routeBody("google-1", "Google default route", 1_900_000, 86_400, true),
          routeBody("google-2", "Google alternative 2", 2_050_000, 90_000, false),
        ],
        sourcePolyline: null,
        mapStops: [
          { label: "Santos", role: "origin", location: { latitude: -23.96, longitude: -46.33 } },
          { label: "Montevideo", role: "destination", location: { latitude: -34.91, longitude: -56.19 } },
        ],
        fidelity: {
          verdict: "not_recoverable",
          selectedRoutePreserved: false,
          headline: "The shared selection was not preserved.",
          reasons: ["Fixture."],
          comparison: {
            stopsRecovered: 2,
            coordinatesRecovered: 2,
            polylineInSource: false,
            routeTokenInSource: false,
            alternativeCount: 2,
            alternativesAreDistinctGeometries: true,
          },
        },
        googleApi: { attempted: true, enabled: true, configured: true, error: null },
      },
    },
  });
}

function routeBody(
  id: string,
  label: string,
  distanceMeters: number,
  durationSeconds: number,
  isDefaultAlternative: boolean,
) {
  return {
    id,
    label,
    source: "google_routes_api",
    synthetic: false,
    encodedPolyline: id === "google-1" ? "route-one" : "route-two",
    distanceMeters,
    durationSeconds,
    description: "E2E fixture",
    isDefaultAlternative,
  };
}

function fakeMapsScript(): string {
  return `
    window.google = {
      maps: {
        Map: function () { this.fitBounds = function () {}; },
        Polyline: function () { this.setOptions = function () {}; },
        Marker: function () {},
        LatLngBounds: function () { this.extend = function () {}; },
        geometry: { encoding: { decodePath: function () { return [{ lat: function () { return -23.9; }, lng: function () { return -46.3; } }]; } } }
      }
    };
  `;
}
