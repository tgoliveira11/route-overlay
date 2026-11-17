import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildConfirmedRoute,
  confirmedRouteDisposition,
  loadConfirmedRoute,
  loadSessionConfirmedRoute,
  readConfirmedRoute,
  routeRevisionId,
  selectAnalysisGeometry,
  writeSessionConfirmedRoute,
} from "@/lib/route-overlay/confirmed-route-store";
import { chronologyViolations, numericDifferences, offsetMislabelsUtcClock, parseInstant } from "@/lib/route-overlay/stations/chronology";
import { assertSessionId } from "@/lib/route-overlay/confirmation-session";
import { localDiagnosticRefusal } from "@/lib/route-overlay/local-diagnostic";

describe("research chronology", () => {
  it("converts a zoned timestamp to its absolute instant", () => {
    expect(parseInstant("2026-11-17T14:20:06-03:00")).toBe(Date.parse("2026-11-17T17:20:06Z"));
    expect(parseInstant("2026-11-17T14:20:06.476Z")).toBe(Date.parse("2026-11-17T14:20:06.476Z"));
  });

  it("detects an offset applied to a UTC wall clock", () => {
    expect(offsetMislabelsUtcClock("2026-11-17T14:20:06-03:00", "2026-11-17T14:20:06.476Z")).toBe(true);
    expect(offsetMislabelsUtcClock("2026-11-17T14:20:06.476Z", "2026-11-17T14:20:06.476Z")).toBe(false);
    expect(offsetMislabelsUtcClock("2026-11-17T11:20:06-03:00", "2026-11-17T14:20:06.476Z")).toBe(false);
  });

  it("flags a generation label that precedes the claimed retrieval instant", () => {
    const violations = chronologyViolations([
      { name: "claimedCsvInstant", instant: "2026-11-17T17:20:06.000Z" },
      { name: "publishedGeneratedAt", instant: "2026-11-17T14:40:00.000Z" },
    ]);
    expect(violations).toHaveLength(1);
    expect(violations[0].later).toBe("publishedGeneratedAt");
  });

  it("reports aggregate mismatches without replacing either side", () => {
    expect(numericDifferences({ premium: 294, within2Km: 82 }, { premium: 294, within2Km: 80 })).toEqual([
      { metric: "within2Km", expected: 82, actual: 80 },
    ]);
  });
});

describe("local diagnostic boundary", () => {
  it("accepts only a direct loopback host and a bare UUID", () => {
    expect(localDiagnosticRefusal(new Request("http://127.0.0.1/api/routes/confirmed-geometry"))).toBeNull();
    expect(localDiagnosticRefusal(new Request("http://localhost/api/routes/confirmed-geometry"))).toBeNull();
    expect(localDiagnosticRefusal(new Request("https://example.com/api/routes/confirmed-geometry"))).not.toBeNull();
    const forwarded = new Request("http://127.0.0.1/api/routes/confirmed-geometry", {
      headers: { "x-forwarded-for": "203.0.113.4" },
    });
    expect(localDiagnosticRefusal(forwarded)).not.toBeNull();
    expect(assertSessionId("../etc/passwd")).toBeNull();
    expect(assertSessionId("11111111-1111-4111-8111-111111111111/extra")).toBeNull();
    expect(assertSessionId("11111111-1111-4111-8111-111111111111")).toBe("11111111-1111-4111-8111-111111111111");
  });
});

describe("confirmed route retention", () => {
  const sessionId = "11111111-1111-4111-8111-111111111111";
  const otherSessionId = "22222222-2222-4222-8222-222222222222";
  const now = Date.parse("2026-11-17T18:00:00Z");

  it("keeps an unexpired Google confirmation and rejects a stale one", () => {
    const record = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00Z",
      candidateId: "google-1",
      label: "Confirmed",
      encodedPolyline: "encoded-polyline",
      distanceMeters: 100,
      durationSeconds: 10,
      routingRevision: "revision-1",
      sessionId,
      source: "google_routes_api",
      synthetic: false,
    }, now);
    expect(record?.revisionId).toBe(routeRevisionId("encoded-polyline"));
    expect(record?.sessionId).toBe(sessionId);
    expect(readConfirmedRoute(record, now)).not.toBeNull();
    expect(readConfirmedRoute(record, now + 31 * 24 * 60 * 60 * 1000)).toBeNull();
  });

  it("does not substitute the cached default when a confirmed route is required", () => {
    const missing = selectAnalysisGeometry("confirmed_google", null);
    expect(missing.status).toBe("unavailable");
    expect(missing.confirmed).toBeNull();
    const mock = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00Z",
      candidateId: "mock-1",
      label: "Mock",
      encodedPolyline: "mock-polyline",
      distanceMeters: null,
      durationSeconds: null,
      routingRevision: "mock-revision",
      sessionId,
      source: "mock",
      synthetic: true,
    }, now);
    expect(selectAnalysisGeometry("confirmed_google", mock).status).toBe("unavailable");
    const google = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00Z",
      candidateId: "google-1",
      label: "Confirmed",
      encodedPolyline: "encoded-polyline",
      distanceMeters: 100,
      durationSeconds: 10,
      routingRevision: "provider-revision",
      sessionId,
      source: "google_routes_api",
      synthetic: false,
    }, now);
    const selected = selectAnalysisGeometry("confirmed_google", google);
    expect(selected.status).toBe("confirmed");
    expect(selected.confirmed?.revisionId).toBe(routeRevisionId("encoded-polyline"));
    expect(selected.confirmed?.routingRevision).toBe("provider-revision");
    expect(selectAnalysisGeometry("labeled_default", google)).toEqual({
      status: "labeled_default",
      reason: "The caller asked for the cached default and labeled it as such.",
      confirmed: null,
    });
  });

  it("keeps one session from reading another session file", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR = directory;
    const record = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00Z",
      candidateId: "google-1",
      label: "Confirmed",
      encodedPolyline: "session-a-polyline",
      distanceMeters: 10,
      durationSeconds: 1,
      routingRevision: "provider-revision",
      sessionId,
      source: "google_routes_api",
      synthetic: false,
    }, now);
    expect(writeSessionConfirmedRoute(record!)).toBe(true);
    expect(loadSessionConfirmedRoute(now, sessionId)?.revisionId).toBe(record?.revisionId);
    expect(loadSessionConfirmedRoute(now, otherSessionId)).toBeNull();
    expect(readFileSync(path.join(directory, `${sessionId}.json`), "utf8")).toContain("session-a-polyline");
    delete process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR;
  });

  it("deletes an expired polyline without deleting another file", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "route-overlay-confirmed-"));
    const expiredPath = path.join(directory, "expired.json");
    const otherPath = path.join(directory, "other.json");
    const active = buildConfirmedRoute({
      confirmedAt: "2026-11-17T18:00:00Z",
      candidateId: "google-1",
      label: "Active",
      encodedPolyline: "active-polyline",
      distanceMeters: 10,
      durationSeconds: 1,
      routingRevision: "provider-revision",
      sessionId,
      source: "google_routes_api",
      synthetic: false,
    }, now);
    writeFileSync(expiredPath, `${JSON.stringify({ ...active, confirmedAt: "2026-10-01T00:00:00Z", expiresAt: "2026-10-31T00:00:00Z" })}\n`);
    writeFileSync(otherPath, `${JSON.stringify(active)}\n`);
    expect(confirmedRouteDisposition(JSON.parse(readFileSync(expiredPath, "utf8")), now)).toBe("expired");
    expect(loadConfirmedRoute(now, expiredPath)).toBeNull();
    expect(existsSync(expiredPath)).toBe(false);
    expect(existsSync(otherPath)).toBe(true);
  });
});

