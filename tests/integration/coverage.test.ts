import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as coverageMapLoad } from "@/app/api/stations/map-load/route";
import { MAX_PHASE5_MAP_LOADS } from "@/lib/route-overlay/stations/budget";

afterEach(() => {
  delete process.env.ROUTE_OVERLAY_BUDGET_PATH;
  delete process.env.ROUTE_OVERLAY_PHASE5_BUDGET_PATH;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("coverage map budget", () => {
  it("stops at the phase 5 map ceiling and does not reveal a Places key", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-phase5-"));
    process.env.ROUTE_OVERLAY_BUDGET_PATH = path.join(directory, "routes.json");
    process.env.ROUTE_OVERLAY_PHASE5_BUDGET_PATH = path.join(directory, "phase5.json");
    process.env.GOOGLE_PLACES_API_KEY = "places-key-must-stay-hidden";
    for (let index = 0; index < MAX_PHASE5_MAP_LOADS; index += 1) {
      expect(coverageMapLoad().status).toBe(200);
    }
    const denied = coverageMapLoad();
    expect(denied.status).toBe(429);
    expect(JSON.stringify(await denied.json())).not.toContain("places-key-must-stay-hidden");
  });
});
