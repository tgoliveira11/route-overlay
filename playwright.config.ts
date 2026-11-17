import { defineConfig, devices } from "@playwright/test";

const e2ePort = 3100;
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev:e2e",
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      ...(process.env.ROUTE_OVERLAY_LIVE_EXPERIMENT === "true"
        ? {}
        : {
            ROUTE_OVERLAY_GOOGLE_API_ENABLED: "false",
            GOOGLE_ROUTES_API_KEY: "",
            ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED: "false",
            GOOGLE_MAPS_JS_API_KEY: "",
          }),
      ROUTE_OVERLAY_PLACES_ENABLED: "false",
      GOOGLE_PLACES_API_KEY: "",
      ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR: ".route-overlay/e2e-confirmed-routes",
    },
  },
});
