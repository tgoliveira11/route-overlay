import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST as postConfirmation } from "@/app/api/routes/confirmed-geometry/route";
import { POST as postCoverage } from "@/app/api/stations/confirmed-coverage/route";
import { encodePolyline } from "@/lib/route-overlay/polyline";
import { buildConfirmedRoute, writeSessionConfirmedRoute } from "@/lib/route-overlay/confirmed-route-store";

const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  delete process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR;
  delete process.env.ROUTE_OVERLAY_STATION_OBSERVATIONS_PATH;
  delete process.env.ROUTE_OVERLAY_COVERAGE_SUMMARY_PATH;
});

describe("confirmed geometry persistence", () => {
  it("stores one session and does not return the polyline", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR = directory;
    const response = await postConfirmation(new Request("http://127.0.0.1/api/routes/confirmed-geometry", {
      method: "POST",
      body: JSON.stringify({
        sessionId: sessionA,
        confirmedAt: "2026-11-17T18:00:00Z",
        source: "google_routes_api",
        synthetic: false,
        candidateId: "google-1",
        label: "Confirmed live route",
        encodedPolyline: "secret-polyline-value",
        distanceMeters: 1936072,
        durationSeconds: 86755,
        routingRevision: "revision-1",
      }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { stored: boolean; revisionId: string; sessionId: string };
    expect(body.stored).toBe(true);
    expect(body.sessionId).toBe(sessionA);
    expect(JSON.stringify(body)).not.toContain("secret-polyline-value");
    expect(Object.keys(body)).not.toContain("encodedPolyline");
    const stored = readFileSync(path.join(directory, `${sessionA}.json`), "utf8");
    expect(stored).toContain("secret-polyline-value");
    expect(existsSync(path.join(directory, `${sessionB}.json`))).toBe(false);
  });

  it("purges an expired session without reading another session", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR = directory;
    const expired = buildConfirmedRoute({
      confirmedAt: "2026-10-01T00:00:00.000Z",
      candidateId: "google-1",
      label: "Old",
      encodedPolyline: "expired-polyline-value",
      distanceMeters: 1,
      durationSeconds: 1,
      routingRevision: "old-revision",
      sessionId: sessionA,
      source: "google_routes_api",
      synthetic: false,
    }, Date.parse("2026-10-01T00:00:00.000Z"));
    const other = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00.000Z",
      candidateId: "google-1",
      label: "Other",
      encodedPolyline: "other-session-polyline",
      distanceMeters: 1,
      durationSeconds: 1,
      routingRevision: "other-revision",
      sessionId: sessionB,
      source: "google_routes_api",
      synthetic: false,
    }, Date.parse("2026-11-17T18:00:00.000Z"));
    expect(writeSessionConfirmedRoute(expired!)).toBe(true);
    expect(writeSessionConfirmedRoute(other!)).toBe(true);
    const response = await postConfirmation(new Request("http://127.0.0.1/api/routes/confirmed-geometry", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionA }),
    }));
    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).not.toContain("expired-polyline-value");
    expect(existsSync(path.join(directory, `${sessionA}.json`))).toBe(false);
    expect(readFileSync(path.join(directory, `${sessionB}.json`), "utf8")).toContain("other-session-polyline");
  });

  it("counts a confirmed revision for one session and refuses the cached default for another", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR = directory;
    const observationsPath = path.join(directory, "observations.json");
    const summaryPath = path.join(directory, "summary.json");
    writeFileSync(observationsPath, JSON.stringify([
      { premium: true, location: { latitude: -23.96, longitude: -46.33 } },
      { premium: true, location: { latitude: -34.9, longitude: -56.2 } },
    ]));
    writeFileSync(summaryPath, JSON.stringify({ population: { premiumWithin2Km: 82, premiumBetween2And5Km: 42 } }));
    process.env.ROUTE_OVERLAY_STATION_OBSERVATIONS_PATH = observationsPath;
    process.env.ROUTE_OVERLAY_COVERAGE_SUMMARY_PATH = summaryPath;
    const polyline = encodePolyline([
      { latitude: -23.95, longitude: -46.33 },
      { latitude: -32.56, longitude: -53.37 },
    ]);
    const confirmed = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00.000Z",
      candidateId: "google-1",
      label: "Confirmed",
      encodedPolyline: polyline,
      distanceMeters: 100,
      durationSeconds: 10,
      routingRevision: "provider-revision",
      sessionId: sessionA,
      source: "google_routes_api",
      synthetic: false,
    }, Date.parse("2026-11-17T18:00:00.000Z"));
    expect(writeSessionConfirmedRoute(confirmed!)).toBe(true);
    const confirmedResponse = await postCoverage(new Request("http://127.0.0.1/api/stations/confirmed-coverage", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionA }),
    }));
    const confirmedBody = await confirmedResponse.json() as {
      status: string;
      confirmedPremiumWithin2Km: number;
      cachedDefaultSubstituted: boolean;
      historicalPremiumWithin2Km: number;
    };
    expect(confirmedBody.status).toBe("confirmed");
    expect(confirmedBody.cachedDefaultSubstituted).toBe(false);
    expect(confirmedBody.confirmedPremiumWithin2Km).toBe(1);
    expect(confirmedBody.historicalPremiumWithin2Km).toBe(82);
    expect(JSON.stringify(confirmedBody)).not.toContain(polyline);
    const otherResponse = await postCoverage(new Request("http://127.0.0.1/api/stations/confirmed-coverage", {
      method: "POST",
      body: JSON.stringify({ sessionId: sessionB }),
    }));
    const otherBody = await otherResponse.json() as { status: string; confirmedPremiumWithin2Km: number | null };
    expect(otherBody.status).toBe("unavailable");
    expect(otherBody.confirmedPremiumWithin2Km).toBeNull();
  });

  it("refuses a non-loopback confirmation before writing a session file", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR = directory;
    const response = await postConfirmation(new Request("https://example.com/api/routes/confirmed-geometry", {
      method: "POST",
      body: JSON.stringify({
        sessionId: sessionA,
        confirmedAt: "2026-11-17T18:00:00Z",
        source: "google_routes_api",
        synthetic: false,
        candidateId: "google-1",
        label: "Remote",
        encodedPolyline: "remote-polyline-value",
        distanceMeters: 1,
        durationSeconds: 1,
        routingRevision: "revision-1",
      }),
    }));
    expect(response.status).toBe(403);
    expect(JSON.stringify(await response.json())).not.toContain("remote-polyline-value");
    expect(existsSync(path.join(directory, `${sessionA}.json`))).toBe(false);
  });
});
