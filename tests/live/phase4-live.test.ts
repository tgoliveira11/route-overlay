/**
 * Explicit live experiment. The default Vitest include does not run this file.
 * Start it only with ROUTE_OVERLAY_LIVE_EXPERIMENT=true. Each successful or
 * failed computeRoutes call counts toward the local cap of 20.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeGoogleRoutes } from "@/lib/route-overlay/google-routes";
import {
  fileLiveBudgetStore,
  MAX_COMPUTE_ROUTES_CALLS,
  memoryLiveBudgetStore,
} from "@/lib/route-overlay/live-budget";
import { selectedPolylineRendered } from "@/lib/route-overlay/map-readiness";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import { applyDraft, createDraftWaypoint } from "@/lib/route-overlay/refinement";
import { confirmationEligibility, routingRevision } from "@/lib/route-overlay/revision";
import { PLAN_SCENARIOS } from "@/lib/route-overlay/scenarios";
import type { GeoPoint, ReconstructionResult } from "@/lib/route-overlay/types";

const LIVE = process.env.ROUTE_OVERLAY_LIVE_EXPERIMENT === "true";
const SUMMARY_PATH = path.join(process.cwd(), ".route-overlay", "phase4-live-summary.json");
const BUDGET_PATH = path.join(process.cwd(), ".route-overlay", "phase4-budget.json");

const CHUI: GeoPoint = { latitude: -33.69, longitude: -53.46 };
const JAGUARAO: GeoPoint = { latitude: -32.56, longitude: -53.37 };

interface RouteSummary {
  id: string;
  label: string;
  description: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  pointCount: number;
  closestToChuiMeters: number | null;
  closestToJaguaraoMeters: number | null;
  /** Present only in the gitignored experiment artifact. */
  encodedPolyline: string | null;
}

interface ScenarioSummary {
  id: string;
  title: string;
  evidence: string;
  ok: boolean;
  error: string | null;
  routeCount: number;
  alternativesRequested: boolean;
  routes: RouteSummary[];
  waypoint: string | null;
  closestToRequestedWaypointMeters: number | null;
}

describe.skipIf(!LIVE)("phase 4 live Google Routes experiment", () => {
  it("reconstructs the bounded Santos scenarios and withholds confirmation after a draft change", async () => {
    const env = loadEnvFile(path.join(process.cwd(), ".env.local"));
    const apiKey = env.GOOGLE_ROUTES_API_KEY?.trim() ?? "";
    expect(apiKey.length).toBeGreaterThan(20);
    const store = fileLiveBudgetStore(BUDGET_PATH);
    const before = store.read().computeRoutesCalls;
    expect(before).toBeLessThan(MAX_COMPUTE_ROUTES_CALLS);

    const disabled = await computeGoogleRoutes(parseMapsUrl(scenarioUrl("A")), {
      config: { enabled: false, apiKey },
      fetchImpl: () => {
        throw new Error("Disabled credentials must not call Google.");
      },
      countLiveRequest: true,
      budgetStore: store,
    });
    expect(disabled.googleApi.attempted).toBe(false);
    expect(disabled.routes).toHaveLength(0);
    expect(store.read().computeRoutesCalls).toBe(before);

    const capped = await computeGoogleRoutes(parseMapsUrl(scenarioUrl("A")), {
      config: { enabled: true, apiKey: "cap-probe-not-a-real-key" },
      fetchImpl: () => {
        throw new Error("The local cap must refuse this call before fetch.");
      },
      countLiveRequest: true,
      budgetStore: memoryLiveBudgetStore({
        computeRoutesCalls: MAX_COMPUTE_ROUTES_CALLS,
        mapLoads: 0,
      }),
    });
    expect(capped.googleApi.attempted).toBe(true);
    expect(capped.googleApi.error).toContain("Local experiment cap");
    expect(capped.routes).toHaveLength(0);

    const previous = readSummary();
    const scenarios: ScenarioSummary[] = [];
    const liveResults = new Map<"A" | "B" | "C" | "D", ReconstructionResult>();
    for (const id of ["A", "B", "C", "D"] as const) {
      const cached = previous.scenarios.find((item) => item.id === id && item.ok);
      if (cached) {
        scenarios.push(cached);
        continue;
      }
      if (store.read().computeRoutesCalls >= MAX_COMPUTE_ROUTES_CALLS) {
        scenarios.push(emptyScenario(id, "Local experiment cap reached before this scenario."));
        break;
      }
      const parsed = parseMapsUrl(scenarioUrl(id));
      const result = await computeGoogleRoutes(parsed, {
        config: { enabled: true, apiKey },
        countLiveRequest: true,
        budgetStore: store,
      });
      liveResults.set(id, result);
      const summary = summarizeScenario(id, result);
      scenarios.push(summary);
      writeSummary({
        computeRoutesCalls: store.read().computeRoutesCalls,
        scenarios,
        confirmation: null,
        fidelity: "UNVERIFIED",
      });
      expect(JSON.stringify(summary).includes(apiKey)).toBe(false);
      if (!summary.ok) {
        break;
      }
    }

    expect(scenarios.map((item) => item.id)).toEqual(["A", "B", "C", "D"]);
    for (const scenario of scenarios) {
      expect(scenario.ok, scenario.error ?? scenario.id).toBe(true);
    }

    const parsedA = parseMapsUrl(scenarioUrl("A"));
    const selectedPolyline =
      liveResults.get("A")?.routes[0]?.encodedPolyline ??
      scenarios.find((item) => item.id === "A")?.routes[0]?.encodedPolyline ??
      null;
    const alternatePolyline =
      liveResults.get("A")?.routes[1]?.encodedPolyline ??
      scenarios.find((item) => item.id === "A")?.routes[1]?.encodedPolyline ??
      "different-polyline";
    if (!selectedPolyline) {
      throw new Error("Scenario A did not keep a polyline for the confirmation check.");
    }
    const revision = routingRevision(parsedA);
    const rendered = selectedPolylineRendered({
      selectedPolyline,
      renderedPolyline: selectedPolyline,
      mapReportedReady: true,
    });
    const eligible = confirmationEligibility({
      draftRevision: revision,
      geometryRevision: revision,
      mock: false,
      mapsDisplayReady: rendered,
      candidateConfirmable: true,
    });
    expect(eligible.allowed).toBe(true);

    const mismatched = selectedPolylineRendered({
      selectedPolyline,
      renderedPolyline: alternatePolyline,
      mapReportedReady: true,
    });
    expect(mismatched).toBe(false);

    const draft = createDraftWaypoint("-33.6900, -53.4600", "chui");
    expect("error" in draft).toBe(false);
    if ("error" in draft) {
      throw new Error(draft.error);
    }
    const changed = applyDraft(parsedA, [draft]);
    const stale = confirmationEligibility({
      draftRevision: routingRevision(changed),
      geometryRevision: revision,
      mock: false,
      mapsDisplayReady: true,
      candidateConfirmable: true,
    });
    expect(stale.allowed).toBe(false);

    const chui = scenarios.find((item) => item.id === "B");
    const jaguarao = scenarios.find((item) => item.id === "C");
    if (chui?.ok) {
      expect(chui.routeCount).toBe(1);
      expect(chui.closestToRequestedWaypointMeters).not.toBeNull();
      expect(chui.closestToRequestedWaypointMeters ?? Number.POSITIVE_INFINITY).toBeLessThan(2_000);
    }
    if (jaguarao?.ok) {
      expect(jaguarao.routeCount).toBe(1);
      expect(jaguarao.closestToRequestedWaypointMeters ?? Number.POSITIVE_INFINITY).toBeLessThan(2_000);
    }

    writeSummary({
      computeRoutesCalls: store.read().computeRoutesCalls,
      scenarios,
      confirmation: {
        selectedRouteId: scenarios.find((item) => item.id === "A")?.routes[0]?.id ?? null,
        eligibleBeforeEdit: eligible.allowed,
        eligibleAfterWaypointEdit: stale.allowed,
        fidelityIndependentlyVerified: false,
      },
      fidelity: "UNVERIFIED",
    });
  });
});

function summarizeScenario(id: "A" | "B" | "C" | "D", result: ReconstructionResult): ScenarioSummary {
  const scenario = PLAN_SCENARIOS.find((item) => item.id === id);
  const waypoint = id === "B" ? CHUI : id === "C" ? JAGUARAO : null;
  const routes = result.routes.map((route) =>
    summarizeRoute(
      route.encodedPolyline,
      route.id,
      route.label,
      route.description,
      route.distanceMeters,
      route.durationSeconds,
    ),
  );
  const closest = waypoint
    ? Math.min(
        ...routes.map((route) => distanceTo(route, waypoint)).filter((value): value is number => value !== null),
      )
    : null;
  return {
    id,
    title: scenario?.title ?? id,
    evidence: scenario?.evidence ?? "unknown",
    ok: result.googleApi.error === null && result.routes.length > 0 && result.mock === false,
    error: result.googleApi.error,
    routeCount: result.routes.length,
    alternativesRequested: id === "A",
    routes,
    waypoint: waypoint ? `${waypoint.latitude},${waypoint.longitude}` : null,
    closestToRequestedWaypointMeters: Number.isFinite(closest) ? closest : null,
  };
}

function summarizeRoute(
  encoded: string | null,
  id: string,
  label: string,
  description: string,
  distanceMeters: number | null,
  durationSeconds: number | null,
): RouteSummary {
  const points = encoded ? decodePolyline(encoded) : [];
  return {
    id,
    label,
    description,
    distanceMeters,
    durationSeconds,
    pointCount: points.length,
    closestToChuiMeters: closest(points, CHUI),
    closestToJaguaraoMeters: closest(points, JAGUARAO),
    encodedPolyline: encoded,
  };
}

function distanceTo(route: RouteSummary, point: GeoPoint): number | null {
  if (point === CHUI) {
    return route.closestToChuiMeters;
  }
  if (point === JAGUARAO) {
    return route.closestToJaguaraoMeters;
  }
  return null;
}

function closest(points: GeoPoint[], target: GeoPoint): number | null {
  if (points.length === 0) {
    return null;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const point of points) {
    const meters = haversine(point, target);
    if (meters < best) {
      best = meters;
    }
  }
  return Math.round(best);
}

function haversine(a: GeoPoint, b: GeoPoint): number {
  const radius = 6_371_000;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}

function emptyScenario(id: "A" | "B" | "C" | "D", error: string): ScenarioSummary {
  const scenario = PLAN_SCENARIOS.find((item) => item.id === id);
  return {
    id,
    title: scenario?.title ?? id,
    evidence: scenario?.evidence ?? "unknown",
    ok: false,
    error,
    routeCount: 0,
    alternativesRequested: id === "A",
    routes: [],
    waypoint: null,
    closestToRequestedWaypointMeters: null,
  };
}

function scenarioUrl(id: "A" | "B" | "C" | "D"): string {
  const scenario = PLAN_SCENARIOS.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Missing scenario ${id}`);
  }
  return scenario.url;
}

function loadEnvFile(filePath: string): Record<string, string> {
  const text = readFileSync(filePath, "utf8");
  const env: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

interface SummaryFile {
  computeRoutesCalls: number;
  scenarios: ScenarioSummary[];
  confirmation: {
    selectedRouteId: string | null;
    eligibleBeforeEdit: boolean;
    eligibleAfterWaypointEdit: boolean;
    fidelityIndependentlyVerified: false;
  } | null;
  fidelity: "UNVERIFIED";
}

function readSummary(): SummaryFile {
  try {
    return JSON.parse(readFileSync(SUMMARY_PATH, "utf8")) as SummaryFile;
  } catch {
    return {
      computeRoutesCalls: 0,
      scenarios: [],
      confirmation: null,
      fidelity: "UNVERIFIED",
    };
  }
}

function writeSummary(summary: SummaryFile): void {
  mkdirSync(path.dirname(SUMMARY_PATH), { recursive: true });
  writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
}
