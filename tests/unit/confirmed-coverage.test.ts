import { describe, expect, it } from "vitest";
import { encodePolyline } from "@/lib/route-overlay/polyline";
import { buildConfirmedRoute, selectAnalysisGeometry } from "@/lib/route-overlay/confirmed-route-store";
import { compareConfirmedCoverage, measureConfirmedRoute } from "@/lib/route-overlay/stations/confirmed-coverage";

const route = [
  { latitude: -23.95, longitude: -46.33 },
  { latitude: -28.0, longitude: -49.0 },
  { latitude: -32.56, longitude: -53.37 },
  { latitude: -34.9, longitude: -56.18 },
];

describe("confirmed route coverage", () => {
  it("keeps a mock or missing confirmation unavailable and does not use the cached default", () => {
    const mock = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00.000Z",
      candidateId: "mock-1",
      label: "Mock",
      encodedPolyline: encodePolyline(route),
      distanceMeters: 1,
      durationSeconds: 1,
      routingRevision: "mock-revision",
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      source: "mock",
      synthetic: true,
    });
    const choice = selectAnalysisGeometry("confirmed_google", mock);
    expect(choice.status).toBe("unavailable");
    const comparison = compareConfirmedCoverage({
      now: Date.parse("2026-11-17T18:00:00.000Z"),
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      summary: null,
      observations: [],
      confirmed: mock,
    });
    expect(comparison.status).toBe("unavailable");
    expect(comparison.cachedDefaultSubstituted).toBe(false);
    expect(comparison.confirmed).toBeNull();
    expect(comparison.confirmedPremiumWithin2Km).toBeNull();
  });

  it("counts bands from the confirmed geometry and records stations that change bands", () => {
    const measured = measureConfirmedRoute(route, [
      { premium: true, location: { latitude: -23.95, longitude: -46.33 }, band: "outside" },
      { premium: true, location: { latitude: -28.005, longitude: -49.0 }, band: "0_2_km" },
      { premium: true, location: { latitude: -10, longitude: -40 }, band: "2_5_km" },
      { premium: true, location: null, band: "ungeolocated" },
      { premium: false, location: { latitude: -23.95, longitude: -46.33 }, band: "0_2_km" },
    ]);
    expect(measured).not.toBeNull();
    expect(measured?.metrics.premiumWithin2Km).toBe(2);
    expect(measured?.metrics.premiumOutside5Km).toBe(1);
    expect(measured?.metrics.premiumUngeolocated).toBe(1);
    expect(measured?.metrics.premiumEnteredWithin2Km).toBe(1);
    expect(measured?.metrics.premiumLeftBetween2And5Km).toBe(1);
    expect(measured?.metrics.premiumBandChanges).toBe(2);
    expect(measured?.metrics.sourceLabel).toBe("confirmed_google_routes_revision");
    expect(measured?.metrics.brazilianPointCount).toBe(3);
    expect(measured?.metrics.routeLengthMeters).toBeGreaterThan(measured?.metrics.brazilianLengthMeters ?? 0);
  });

  it("returns unavailable when the confirmed geometry misses the border reference", () => {
    const measured = measureConfirmedRoute([
      { latitude: -23.95, longitude: -46.33 },
      { latitude: -24.0, longitude: -46.4 },
    ], [{ premium: true, location: { latitude: -23.95, longitude: -46.33 } }]);
    expect(measured).toBeNull();
  });
});
