import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import {
  loadSessionConfirmedRoute,
  selectAnalysisGeometry,
  type ConfirmedRouteRecord,
} from "@/lib/route-overlay/confirmed-route-store";
import { clipAtNearest, corridorBand, projectOntoPolyline } from "@/lib/route-overlay/stations/proximity";
import type { CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

/** Phase 4 Jaguarão reference used to keep the Brazilian clip. */
export const BRAZIL_BORDER_REFERENCE: GeoPoint = { latitude: -32.56, longitude: -53.37 };

export interface ConfirmedCoverageComparison {
  status: "confirmed" | "unavailable";
  reason: string;
  cachedDefaultSubstituted: false;
  revisionId: string | null;
  expiresAt: string | null;
  confirmedPremiumWithin2Km: number | null;
  confirmedPremiumBetween2And5Km: number | null;
  historicalLabel: "cached_google_default_route";
  historicalPremiumWithin2Km: number | null;
  historicalPremiumBetween2And5Km: number | null;
}

export function premiumBandCounts(
  route: GeoPoint[],
  stations: Array<{ premium: boolean; location: GeoPoint | null }>,
): { within2Km: number; between2And5Km: number } | null {
  const clip = clipAtNearest(route, BRAZIL_BORDER_REFERENCE);
  if (!clip.reliable || clip.points.length < 2) {
    return null;
  }
  let within2Km = 0;
  let between2And5Km = 0;
  for (const station of stations) {
    if (!station.premium || !station.location) {
      continue;
    }
    const projection = projectOntoPolyline(station.location, clip.points);
    const band = corridorBand(projection?.distanceMeters ?? null);
    if (band === "0_2_km") {
      within2Km += 1;
    } else if (band === "2_5_km") {
      between2And5Km += 1;
    }
  }
  return { within2Km, between2And5Km };
}

export function compareConfirmedCoverage(input: {
  now: number;
  sessionId: string;
  summary: CoverageSummary | null;
  observations: StationObservation[] | null;
  confirmed: ConfirmedRouteRecord | null;
}): ConfirmedCoverageComparison {
  const historicalPremiumWithin2Km = input.summary?.population.premiumWithin2Km ?? null;
  const historicalPremiumBetween2And5Km = input.summary?.population.premiumBetween2And5Km ?? null;
  const choice = selectAnalysisGeometry("confirmed_google", input.confirmed);
  if (choice.status !== "confirmed" || !choice.confirmed) {
    return {
      status: "unavailable",
      reason: choice.reason,
      cachedDefaultSubstituted: false,
      revisionId: null,
      expiresAt: null,
      confirmedPremiumWithin2Km: null,
      confirmedPremiumBetween2And5Km: null,
      historicalLabel: "cached_google_default_route",
      historicalPremiumWithin2Km,
      historicalPremiumBetween2And5Km,
    };
  }
  if (!input.observations) {
    return {
      status: "unavailable",
      reason: "The confirmed route is stored, but the local station observations are unavailable.",
      cachedDefaultSubstituted: false,
      revisionId: choice.confirmed.revisionId,
      expiresAt: choice.confirmed.expiresAt,
      confirmedPremiumWithin2Km: null,
      confirmedPremiumBetween2And5Km: null,
      historicalLabel: "cached_google_default_route",
      historicalPremiumWithin2Km,
      historicalPremiumBetween2And5Km,
    };
  }
  let decoded: GeoPoint[] = [];
  try {
    decoded = decodePolyline(choice.confirmed.encodedPolyline);
  } catch {
    decoded = [];
  }
  const counts = premiumBandCounts(decoded, input.observations);
  if (!counts) {
    return {
      status: "unavailable",
      reason: "The confirmed polyline does not reach the Brazilian border reference closely enough to count stations.",
      cachedDefaultSubstituted: false,
      revisionId: choice.confirmed.revisionId,
      expiresAt: choice.confirmed.expiresAt,
      confirmedPremiumWithin2Km: null,
      confirmedPremiumBetween2And5Km: null,
      historicalLabel: "cached_google_default_route",
      historicalPremiumWithin2Km,
      historicalPremiumBetween2And5Km,
    };
  }
  return {
    status: "confirmed",
    reason: "Counts use the confirmed Google revision for this session.",
    cachedDefaultSubstituted: false,
    revisionId: choice.confirmed.revisionId,
    expiresAt: choice.confirmed.expiresAt,
    confirmedPremiumWithin2Km: counts.within2Km,
    confirmedPremiumBetween2And5Km: counts.between2And5Km,
    historicalLabel: "cached_google_default_route",
    historicalPremiumWithin2Km,
    historicalPremiumBetween2And5Km,
  };
}

export function observationsPath(): string {
  return process.env.ROUTE_OVERLAY_STATION_OBSERVATIONS_PATH
    ?? path.join(process.cwd(), ".route-overlay", "anp", "station-observations.json");
}

export function coverageSummaryPath(): string {
  return process.env.ROUTE_OVERLAY_COVERAGE_SUMMARY_PATH
    ?? path.join(process.cwd(), "data", "phase5-coverage-summary.json");
}

export function readConfirmedCoverage(now: number, sessionId: string): ConfirmedCoverageComparison {
  const confirmed = loadSessionConfirmedRoute(now, sessionId);
  let summary: CoverageSummary | null = null;
  let observations: StationObservation[] | null = null;
  try {
    summary = JSON.parse(readFileSync(coverageSummaryPath(), "utf8")) as CoverageSummary;
  } catch {
    summary = null;
  }
  try {
    observations = JSON.parse(readFileSync(observationsPath(), "utf8")) as StationObservation[];
  } catch {
    observations = null;
  }
  return compareConfirmedCoverage({ now, sessionId, summary, observations, confirmed });
}
