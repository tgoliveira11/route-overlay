import { describe, expect, it } from "vitest";
import { presentCandidates } from "@/lib/route-overlay/candidates";
import { buildRoutesRequest } from "@/lib/route-overlay/google-routes";
import { readMapsDisplayConfig } from "@/lib/route-overlay/maps-display";
import {
  clearSession,
  loadSession,
  parseSession,
  saveSession,
  type KeyValueStore,
} from "@/lib/route-overlay/confirmation";
import { classifyFriction, emptyEffort, invalidateConfirmation, markConfirmed } from "@/lib/route-overlay/effort";
import { reconstructMock } from "@/lib/route-overlay/mock-reconstruct";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import {
  applyDraft,
  createDraftWaypoint,
  describeRoutingConstraints,
  intermediateDrafts,
  moveDraft,
  parseCoordinateText,
  removeDraft,
} from "@/lib/route-overlay/refinement";
import {
  confirmationEligibility,
  isCurrentRouteRequest,
  routingRevision,
} from "@/lib/route-overlay/revision";
import { scenarioById } from "@/lib/route-overlay/scenarios";
import { planStopsAlongPoints } from "@/lib/route-overlay/stop-plan";
import type { SyntheticStation } from "@/lib/route-overlay/fuel-stations";
import type { PlanningSession } from "@/lib/route-overlay/confirmation";

describe("candidate selection", () => {
  it("offers more than one mock candidate when the URL has no intermediate waypoint", () => {
    const parsed = parseMapsUrl(scenarioById("A").url);
    const set = presentCandidates(parsed, reconstructMock(parsed));
    expect(set.alternativesAvailable).toBe(true);
    expect(set.candidates.length).toBeGreaterThan(1);
    expect(set.candidates.every((candidate) => candidate.kind === "mock_candidate")).toBe(true);
    expect(set.candidates.every((candidate) => candidate.route.synthetic)).toBe(true);
  });

  it("does not present extra mock bends as alternatives when waypoints fix the order", () => {
    const parsed = parseMapsUrl(scenarioById("B").url);
    const reconstruction = reconstructMock(parsed);
    expect(reconstruction.routes.length).toBeGreaterThan(1);
    const set = presentCandidates(parsed, reconstruction);
    expect(set.alternativesAvailable).toBe(false);
    expect(set.candidates).toHaveLength(1);
    expect(set.candidates[0].kind).toBe("mock_waypoint_fallback");
    expect(set.limitation).toMatch(/does not return alternative routes/i);
  });

  it("does not pad a live result with synthetic alternatives", () => {
    const parsed = parseMapsUrl(scenarioById("A").url);
    const mock = reconstructMock(parsed);
    const live = {
      ...mock,
      mock: false,
      source: "google_routes_api" as const,
      routes: mock.routes.slice(0, 1).map((route) => ({
        ...route,
        source: "google_routes_api" as const,
        synthetic: false,
      })),
    };
    const set = presentCandidates(parsed, live);
    expect(set.candidates).toHaveLength(1);
    expect(set.candidates[0].kind).toBe("live_alternative");
    expect(set.candidates[0].route.synthetic).toBe(false);
  });
});

describe("manual refinement", () => {
  it("adds, reorders, and removes waypoints without changing the original URL", () => {
    const parsed = parseMapsUrl(scenarioById("A").url);
    const first = createDraftWaypoint("-33.6900, -53.4600", "chui");
    const second = createDraftWaypoint("-32.5600, -53.3700", "jaguarao");
    expect("error" in first || "error" in second).toBe(false);
    if ("error" in first || "error" in second) {
      return;
    }
    const moved = moveDraft([first, second], "jaguarao", -1);
    expect(moved.map((waypoint) => waypoint.id)).toEqual(["jaguarao", "chui"]);
    const kept = removeDraft(moved, "chui");
    const revised = applyDraft(parsed, kept);
    expect(parsed.inputUrl).toBe(scenarioById("A").url);
    expect(revised.inputUrl).toBe(parsed.inputUrl);
    expect(revised.stops.map((stop) => stop.role)).toEqual(["origin", "waypoint", "destination"]);
    expect(revised.stops[1].location?.latitude).toBeCloseTo(-32.56, 2);
    expect(revised.encodedPolyline).toBeNull();
  });

  it("rejects coordinates outside the valid range", () => {
    expect(parseCoordinateText("120, 10")).toBeNull();
    expect(createDraftWaypoint("   ", "empty")).toEqual({
      error: "Enter a place name or a latitude, longitude pair.",
    });
  });
});

describe("confirmation and friction", () => {
  it("rejects a stored claim of independent fidelity", () => {
    const session = confirmedSession();
    expect(parseSession({ ...session, confirmed: { ...session.confirmed, fidelityIndependentlyVerified: true } })).toBeNull();
    expect(parseSession({ ...session, version: 1 })).toBeNull();
    expect(parseSession({ ...session, version: 3 })).toBeNull();
  });

  it("rejects a confirmation whose URL does not match the imported route", () => {
    const session = confirmedSession();
    expect(
      parseSession({
        ...session,
        importedUrl: scenarioById("B").url,
      }),
    ).toBeNull();
  });

  it("round-trips a versioned session and can reset it", () => {
    const store = memoryStore();
    const session = confirmedSession();
    saveSession(store, session);
    expect(loadSession(store)?.confirmed?.candidateId).toBe("mock-b");
    clearSession(store);
    expect(loadSession(store)).toBeNull();
  });

  it("classifies provisional friction from local counts", () => {
    const started = emptyEffort();
    expect(classifyFriction(markConfirmed(started, "2026-11-16T18:00:00.000Z"))).toBe("low");
    expect(
      classifyFriction(
        markConfirmed({ ...started, waypointsAdded: 1, recalculations: 1 }, "2026-11-16T18:05:00.000Z"),
      ),
    ).toBe("moderate");
    expect(
      classifyFriction(
        markConfirmed({ ...started, waypointsAdded: 4, recalculations: 3 }, "2026-11-16T18:20:00.000Z"),
      ),
    ).toBe("high");
    expect(classifyFriction({ ...started, outcome: "abandoned" })).toBe("high");
    const completed = markConfirmed(started, "2026-11-16T18:00:00.000Z");
    const invalidated = invalidateConfirmation(completed);
    expect(invalidated.outcome).toBe("in_progress");
    expect(invalidated.confirmationCompletedAt).toBeNull();
    expect(classifyFriction(invalidated)).toBe("high");
  });
});

describe("stop planning", () => {
  it("selects a synthetic station inside the detour and skips the wrong fuel", () => {
    const station: SyntheticStation = {
      id: "near",
      name: "Synthetic station near",
      synthetic: true,
      location: { latitude: -10.5, longitude: -10.5 },
      fuels: ["gasoline"],
      open24h: true,
    };
    const plan = planStopsAlongPoints(
      [
        { latitude: -10, longitude: -10 },
        { latitude: -10.5, longitude: -10.5 },
      ],
      {
        fuel: "diesel",
        rangeKm: 500,
        reserveKm: 50,
        maxDetourKm: 5,
        intervalKm: 20,
        prefer24h: false,
      },
      [station],
    );
    expect(plan.stops).toHaveLength(0);
    expect(plan.disclaimer).toMatch(/not real businesses/i);

    const gasoline = planStopsAlongPoints(
      [
        { latitude: -10, longitude: -10 },
        { latitude: -10.5, longitude: -10.5 },
      ],
      {
        fuel: "gasoline",
        rangeKm: 500,
        reserveKm: 50,
        maxDetourKm: 5,
        intervalKm: 20,
        prefer24h: true,
      },
      [station],
    );
    expect(gasoline.stops[0]?.station.id).toBe("near");
    expect(gasoline.stops[0]?.synthetic).toBe(true);
    expect(gasoline.stops[0]?.detourMethod).toBe("straight_line");
    expect(gasoline.disclaimer).toMatch(/straight-line/i);
    expect(gasoline.disclaimer).toMatch(/does not claim real-world refueling safety/i);
  });

  it("does not restore range after a miss or repeat a station", () => {
    const station: SyntheticStation = {
      id: "only",
      name: "Synthetic only station",
      synthetic: true,
      location: { latitude: 0.4, longitude: 0 },
      fuels: ["gasoline"],
      open24h: false,
    };
    const plan = planStopsAlongPoints(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0.4, longitude: 0 },
        { latitude: 1.2, longitude: 0 },
      ],
      {
        fuel: "gasoline",
        rangeKm: 150,
        reserveKm: 20,
        maxDetourKm: 10,
        intervalKm: 30,
        prefer24h: false,
      },
      [station],
    );
    expect(plan.stops.filter((stop) => stop.station.id === "only")).toHaveLength(1);
    expect(plan.feasible).toBe(false);
    expect(plan.gaps.length).toBeGreaterThan(0);
  });

  it("reports an unreachable end instead of calling the plan feasible", () => {
    const plan = planStopsAlongPoints(
      [
        { latitude: 0, longitude: 0 },
        { latitude: 0, longitude: 2 },
      ],
      {
        fuel: "gasoline",
        rangeKm: 50,
        reserveKm: 10,
        maxDetourKm: 5,
        intervalKm: 20,
        prefer24h: false,
      },
      [],
    );
    expect(plan.stops).toHaveLength(0);
    expect(plan.feasible).toBe(false);
    expect(plan.gaps.some((gap) => /usable range/i.test(gap))).toBe(true);
  });
});

describe("draft revision and confirmation eligibility", () => {
  it("blocks confirmation of geometry that predates a new waypoint", () => {
    const parsed = parseMapsUrl(scenarioById("A").url);
    const before = routingRevision(parsed);
    const draft = createDraftWaypoint("-33.6900, -53.4600", "chui");
    expect("error" in draft).toBe(false);
    if ("error" in draft) {
      return;
    }
    const revised = applyDraft(parsed, [draft]);
    const after = routingRevision(revised);
    expect(after).not.toBe(before);
    expect(revised.inputUrl).toBe(parsed.inputUrl);
    const blocked = confirmationEligibility({
      draftRevision: after,
      geometryRevision: before,
      mock: true,
      mapsDisplayReady: false,
      candidateConfirmable: true,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/Recalculate/i);
    const current = confirmationEligibility({
      draftRevision: after,
      geometryRevision: after,
      mock: true,
      mapsDisplayReady: false,
      candidateConfirmable: true,
    });
    expect(current.allowed).toBe(true);
  });

  it("drops a reconstruction response that belongs to an older draft generation", () => {
    expect(isCurrentRouteRequest(1, 2, "a", "a")).toBe(false);
    expect(isCurrentRouteRequest(2, 2, "a", "b")).toBe(false);
    expect(isCurrentRouteRequest(2, 2, "b", "b")).toBe(true);
  });

  it("blocks live confirmation until a Google map is actually ready", () => {
    const blocked = confirmationEligibility({
      draftRevision: "same",
      geometryRevision: "same",
      mock: false,
      mapsDisplayReady: false,
      candidateConfirmable: true,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/Google map/i);
  });
});

describe("routing constraints survive refinement", () => {
  it("keeps avoid flags, place IDs, via semantics, and order", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/dir/?api=1&origin=-23.9539,-46.3318&origin_place_id=ChIJorigin&destination=-34.9055,-56.1851&destination_place_id=ChIJdest&waypoints=via:-33.6900,-53.4600|-32.5600,-53.3700&waypoint_place_ids=ChIJchui|&travelmode=driving&avoid=tolls|highways|ferries",
    );
    expect(parsed.avoid).toEqual({ tolls: true, highways: true, ferries: true });
    expect(parsed.stops[0].placeId).toBe("ChIJorigin");
    expect(parsed.stops[1].via).toBe(true);
    expect(parsed.stops[1].placeId).toBe("ChIJchui");
    expect(parsed.stops[2].via).toBe(false);
    expect(parsed.stops[2].placeId).toBeNull();
    const revised = applyDraft(parsed, intermediateDrafts(parsed));
    expect(revised.inputUrl).toBe(parsed.inputUrl);
    expect(revised.stops.map((stop) => stop.role)).toEqual(["origin", "via", "waypoint", "destination"]);
    expect(revised.normalizedUrl).toContain("avoid=tolls");
    expect(revised.normalizedUrl).toContain("highways");
    expect(revised.normalizedUrl).toContain("ferries");
    expect(revised.normalizedUrl).toContain("origin_place_id=ChIJorigin");
    expect(revised.normalizedUrl).toContain("via%3A-33.69");
    const roundTrip = parseMapsUrl(revised.normalizedUrl);
    expect(roundTrip.stops[1].via).toBe(true);
    expect(roundTrip.stops[1].placeId).toBe("ChIJchui");
    expect(roundTrip.avoid.highways).toBe(true);
    const request = buildRoutesRequest(roundTrip);
    expect(request.body.routeModifiers).toEqual({
      avoidTolls: true,
      avoidHighways: true,
      avoidFerries: true,
    });
    const intermediates = request.body.intermediates as Array<Record<string, unknown>>;
    expect(intermediates[0].via).toBe(true);
    expect(intermediates[1].via).toBeUndefined();
    const report = describeRoutingConstraints(revised);
    expect(report.represented.some((line) => /Avoid tolls, highways, ferries/i.test(line))).toBe(true);
  });

  it("reports avoid flags that this travel mode cannot send", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/dir/?api=1&origin=Santos&destination=Montevideo&travelmode=walking&avoid=tolls",
    );
    const request = buildRoutesRequest(parsed);
    expect(request.body.routeModifiers).toBeUndefined();
    expect(request.warning).toMatch(/routeModifiers are not sent/i);
    expect(describeRoutingConstraints(parsed).unsupported.join(" ")).toMatch(/walking/i);
  });

  it("leaves map display disabled unless both the flag and the key are set", () => {
    expect(readMapsDisplayConfig({} as NodeJS.ProcessEnv).available).toBe(false);
    expect(
      readMapsDisplayConfig({
        ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED: "true",
        GOOGLE_MAPS_JS_API_KEY: "",
      } as unknown as NodeJS.ProcessEnv).available,
    ).toBe(false);
    expect(
      readMapsDisplayConfig({
        ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED: "false",
        GOOGLE_MAPS_JS_API_KEY: "browser-key",
      } as unknown as NodeJS.ProcessEnv).available,
    ).toBe(false);
  });
});

function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function confirmedSession(): PlanningSession {
  return {
    version: 2,
    importedUrl: scenarioById("A").url,
    confirmed: {
      confirmedAt: "2026-11-16T18:00:00.000Z",
      source: "mock",
      synthetic: true,
      fidelityIndependentlyVerified: false,
      candidateId: "mock-b",
      label: "Mock alternative B — synthetic detour",
      encodedPolyline: "_p~iF~ps|U",
      distanceMeters: 1000,
      durationSeconds: 60,
      stops: [
        { role: "origin", label: "Santos", location: { latitude: -23.95, longitude: -46.33 } },
        { role: "destination", label: "Montevideo", location: { latitude: -34.9, longitude: -56.18 } },
      ],
      originalUrl: scenarioById("A").url,
      routingRevision: "revision-a",
      geometryProvenance: "synthetic_from_url_coordinates",
      status: "user_confirmed",
    },
    metrics: markConfirmed(emptyEffort(), "2026-11-16T18:00:00.000Z"),
  };
}
