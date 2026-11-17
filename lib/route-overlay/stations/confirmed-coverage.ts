import { readFileSync } from "node:fs";
import path from "node:path";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import {
  loadSessionConfirmedRoute,
  selectAnalysisGeometry,
  type ConfirmedRouteRecord,
} from "@/lib/route-overlay/confirmed-route-store";
import { clipAtNearest, corridorBand, projectOntoPolyline, routeLength } from "@/lib/route-overlay/stations/proximity";
import { coverageGaps } from "@/lib/route-overlay/stations/report";
import type { CoverageGap, CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

/** Phase 4 Jaguarão reference used to keep the Brazilian clip. */
export const BRAZIL_BORDER_REFERENCE: GeoPoint = { latitude: -32.56, longitude: -53.37 };

export interface ConfirmedRouteMetrics {
  sourceLabel: "confirmed_google_routes_revision";
  pointCount: number;
  routeLengthMeters: number;
  brazilianPointCount: number;
  brazilianLengthMeters: number;
  borderApproachMeters: number;
  premiumWithin2Km: number;
  premiumBetween2And5Km: number;
  premiumOutside5Km: number;
  premiumUngeolocated: number;
  premiumEnteredWithin2Km: number;
  premiumLeftWithin2Km: number;
  premiumEnteredBetween2And5Km: number;
  premiumLeftBetween2And5Km: number;
  premiumBandChanges: number;
  gapsOver100Km: CoverageGap[];
}

export interface ConfirmedCoverageComparison {
  status: "confirmed" | "unavailable";
  reason: string;
  cachedDefaultSubstituted: false;
  revisionId: string | null;
  expiresAt: string | null;
  confirmedPremiumWithin2Km: number | null;
  confirmedPremiumBetween2And5Km: number | null;
  confirmed: ConfirmedRouteMetrics | null;
  historicalLabel: "cached_google_default_route";
  historicalPremiumWithin2Km: number | null;
  historicalPremiumBetween2And5Km: number | null;
}

type CountedStation = {
  premium: boolean;
  location: GeoPoint | null;
  band?: StationObservation["band"];
};

export function premiumBandCounts(
  route: GeoPoint[],
  stations: CountedStation[],
): { within2Km: number; between2And5Km: number } | null {
  return measureConfirmedRoute(route, stations)?.counts ?? null;
}

export function measureConfirmedRoute(
  route: GeoPoint[],
  stations: CountedStation[],
): { counts: { within2Km: number; between2And5Km: number }; metrics: ConfirmedRouteMetrics } | null {
  const clip = clipAtNearest(route, BRAZIL_BORDER_REFERENCE);
  if (!clip.reliable || clip.points.length < 2) {
    return null;
  }
  let within2Km = 0;
  let between2And5Km = 0;
  let outside5Km = 0;
  let ungeolocated = 0;
  let enteredWithin2Km = 0;
  let leftWithin2Km = 0;
  let enteredBetween = 0;
  let leftBetween = 0;
  let bandChanges = 0;
  const projected: Array<Pick<StationObservation, "premium" | "band" | "progressMeters">> = [];
  for (const station of stations) {
    if (!station.premium) {
      continue;
    }
    if (!station.location) {
      ungeolocated += 1;
      if (station.band && station.band !== "ungeolocated") {
        bandChanges += 1;
      }
      continue;
    }
    const projection = projectOntoPolyline(station.location, clip.points);
    const band = corridorBand(projection?.distanceMeters ?? null);
    if (band === "0_2_km") {
      within2Km += 1;
    } else if (band === "2_5_km") {
      between2And5Km += 1;
    } else if (band === "outside") {
      outside5Km += 1;
    } else {
      ungeolocated += 1;
    }
    if (station.band && station.band !== band) {
      bandChanges += 1;
    }
    if (station.band && station.band !== "0_2_km" && band === "0_2_km") {
      enteredWithin2Km += 1;
    }
    if (station.band === "0_2_km" && band !== "0_2_km") {
      leftWithin2Km += 1;
    }
    if (station.band && station.band !== "2_5_km" && band === "2_5_km") {
      enteredBetween += 1;
    }
    if (station.band === "2_5_km" && band !== "2_5_km") {
      leftBetween += 1;
    }
    projected.push({
      premium: true,
      band,
      progressMeters: projection?.progressMeters ?? null,
    });
  }
  const brazilianLengthMeters = routeLength(clip.points);
  return {
    counts: { within2Km, between2And5Km },
    metrics: {
      sourceLabel: "confirmed_google_routes_revision",
      pointCount: route.length,
      routeLengthMeters: routeLength(route),
      brazilianPointCount: clip.points.length,
      brazilianLengthMeters,
      borderApproachMeters: clip.approachMeters,
      premiumWithin2Km: within2Km,
      premiumBetween2And5Km: between2And5Km,
      premiumOutside5Km: outside5Km,
      premiumUngeolocated: ungeolocated,
      premiumEnteredWithin2Km: enteredWithin2Km,
      premiumLeftWithin2Km: leftWithin2Km,
      premiumEnteredBetween2And5Km: enteredBetween,
      premiumLeftBetween2And5Km: leftBetween,
      premiumBandChanges: bandChanges,
      gapsOver100Km: coverageGaps(projected, brazilianLengthMeters),
    },
  };
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
  const unavailable = (reason: string, revisionId: string | null = null, expiresAt: string | null = null): ConfirmedCoverageComparison => ({
    status: "unavailable",
    reason,
    cachedDefaultSubstituted: false,
    revisionId,
    expiresAt,
    confirmedPremiumWithin2Km: null,
    confirmedPremiumBetween2And5Km: null,
    confirmed: null,
    historicalLabel: "cached_google_default_route",
    historicalPremiumWithin2Km,
    historicalPremiumBetween2And5Km,
  });
  if (choice.status !== "confirmed" || !choice.confirmed) {
    return unavailable(choice.reason);
  }
  if (!input.observations) {
    return unavailable(
      "The confirmed route is stored, but the local station observations are unavailable.",
      choice.confirmed.revisionId,
      choice.confirmed.expiresAt,
    );
  }
  let decoded: GeoPoint[] = [];
  try {
    decoded = decodePolyline(choice.confirmed.encodedPolyline);
  } catch {
    decoded = [];
  }
  const measured = measureConfirmedRoute(decoded, input.observations);
  if (!measured) {
    return unavailable(
      "The confirmed polyline does not reach the Brazilian border reference closely enough to count stations.",
      choice.confirmed.revisionId,
      choice.confirmed.expiresAt,
    );
  }
  return {
    status: "confirmed",
    reason: "Counts use the confirmed Google revision for this session. The cached default was not substituted.",
    cachedDefaultSubstituted: false,
    revisionId: choice.confirmed.revisionId,
    expiresAt: choice.confirmed.expiresAt,
    confirmedPremiumWithin2Km: measured.counts.within2Km,
    confirmedPremiumBetween2And5Km: measured.counts.between2And5Km,
    confirmed: measured.metrics,
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
