import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { computeGoogleRoutes } from "@/lib/route-overlay/google-routes";
import { fileLiveBudgetStore, MAX_COMPUTE_ROUTES_CALLS } from "@/lib/route-overlay/live-budget";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import { loadSessionConfirmedRoute } from "@/lib/route-overlay/confirmed-route-store";
import { BRAZIL_BORDER_REFERENCE } from "@/lib/route-overlay/stations/confirmed-coverage";
import {
  classifyFidelity,
  detourDelta,
  detourRequest,
  sampleOffsets,
  selectAnchors,
  selectDetourCandidates,
  type DetourCandidate,
} from "@/lib/route-overlay/stations/detour";
import { clipAtNearest } from "@/lib/route-overlay/stations/proximity";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const MAX_MEASUREMENTS = 5;
const sessionId = process.env.ROUTE_OVERLAY_DETOUR_SESSION?.trim() ?? "";

if (process.env.ROUTE_OVERLAY_DETOUR_EXPERIMENT !== "true" || process.env.ROUTE_OVERLAY_GOOGLE_API_ENABLED !== "true") {
  console.error("Refusing to measure. The detour experiment and Google Routes flags must both be true.");
  process.exit(1);
}
if (!/^[0-9a-f-]{36}$/.test(sessionId)) {
  console.error("Refusing to measure. ROUTE_OVERLAY_DETOUR_SESSION must be the confirmed session id.");
  process.exit(1);
}

const envFile = readEnv(path.join(process.cwd(), ".env.local"));
const apiKey = envFile.GOOGLE_ROUTES_API_KEY?.trim() ?? "";
if (apiKey.length < 20) {
  console.error("Refusing to measure. The local Routes key is missing.");
  process.exit(1);
}

const budgetPath = path.join(process.cwd(), ".route-overlay", "phase4-budget.json");
const store = fileLiveBudgetStore(budgetPath);
const confirmed = loadSessionConfirmedRoute(Date.now(), sessionId);
if (!confirmed || confirmed.synthetic || confirmed.source !== "google_routes_api") {
  console.error("Refusing to measure. No unexpired confirmed Google revision is stored for that session.");
  process.exit(1);
}
const decoded = decodePolyline(confirmed.encodedPolyline);
const clip = clipAtNearest(decoded, BRAZIL_BORDER_REFERENCE);
if (!clip.reliable) {
  console.error("Refusing to measure. The confirmed geometry does not reach the border reference.");
  process.exit(1);
}
const observations = JSON.parse(readFileSync(path.join(process.cwd(), ".route-overlay", "anp", "station-observations.json"), "utf8")) as StationObservation[];
const candidates = selectDetourCandidates(observations, clip.points, 10);
const output = path.join(process.cwd(), "data", "phase8-detour-summary.json");
const measurements: MeasurementRow[] = readPriorMeasurements(output);
const alreadyMeasured = new Set(measurements.map((item) => item.cnpj));
let calls = 0;
let newPairs = 0;

for (const candidate of candidates) {
  if (alreadyMeasured.has(candidate.cnpj)) {
    continue;
  }
  const anchors = selectAnchors(clip.points, candidate.progressMeters);
  if (!anchors) {
    measurements.push(row(candidate, "anchors_unavailable"));
    continue;
  }
  if (newPairs >= MAX_MEASUREMENTS || store.read().computeRoutesCalls + 2 > MAX_COMPUTE_ROUTES_CALLS) {
    measurements.push(row(candidate, "not_measured"));
    continue;
  }
  newPairs += 1;
  const direct = await computeGoogleRoutes(detourRequest(anchors.upstream, anchors.downstream, null), {
    config: { enabled: true, apiKey },
    budgetStore: store,
    countLiveRequest: true,
  });
  calls += 1;
  const directRoute = direct.routes[0];
  if (!directRoute?.encodedPolyline || directRoute.distanceMeters === null || directRoute.durationSeconds === null) {
    measurements.push(row(candidate, "provider_failure", direct.googleApi.error));
    continue;
  }
  const fidelity = classifyFidelity(sampleOffsets(decodePolyline(directRoute.encodedPolyline), clip.points));
  const via = await computeGoogleRoutes(detourRequest(anchors.upstream, anchors.downstream, candidate.location), {
    config: { enabled: true, apiKey },
    budgetStore: store,
    countLiveRequest: true,
  });
  calls += 1;
  const viaRoute = via.routes[0];
  if (!viaRoute || viaRoute.distanceMeters === null || viaRoute.durationSeconds === null) {
    measurements.push(row(candidate, "provider_failure", via.googleApi.error, {
      directDistanceMeters: directRoute.distanceMeters,
      directDurationSeconds: directRoute.durationSeconds,
      fidelity: fidelity.fidelity,
      medianOffsetMeters: fidelity.medianMeters,
    }));
    continue;
  }
  const viaFidelity = viaRoute.encodedPolyline
    ? classifyFidelity(sampleOffsets(decodePolyline(viaRoute.encodedPolyline), clip.points))
    : { fidelity: "provider_failure" as const, medianMeters: null, p95Meters: null };
  const delta = detourDelta(
    { distanceMeters: directRoute.distanceMeters, durationSeconds: directRoute.durationSeconds },
    { distanceMeters: viaRoute.distanceMeters, durationSeconds: viaRoute.durationSeconds },
  );
  const corridorChanged = fidelity.fidelity === "route_changed" || viaFidelity.fidelity === "route_changed";
  const status = corridorChanged
    ? "route_changed"
    : fidelity.fidelity !== "valid_local" || viaFidelity.fidelity !== "valid_local"
      ? viaFidelity.fidelity !== "valid_local" ? viaFidelity.fidelity : fidelity.fidelity
      : delta.extraDistanceMeters < 0 || delta.extraDrivingSeconds < 0
        ? "negative_delta"
        : "valid";
  measurements.push({
    ...row(candidate, status),
    directDistanceMeters: directRoute.distanceMeters,
    viaDistanceMeters: viaRoute.distanceMeters,
    extraDistanceMeters: delta.extraDistanceMeters,
    directDurationSeconds: directRoute.durationSeconds,
    viaDurationSeconds: viaRoute.durationSeconds,
    extraDrivingSeconds: delta.extraDrivingSeconds,
    fidelity: fidelity.fidelity,
    viaFidelity: viaFidelity.fidelity,
    medianOffsetMeters: fidelity.medianMeters,
    p95OffsetMeters: fidelity.p95Meters,
    viaMedianOffsetMeters: viaFidelity.medianMeters,
  });
}

const summary = {
  revisionId: confirmed.revisionId,
  generatedAt: new Date().toISOString(),
  fuelingStopSeconds: 0,
  computeRoutesCallsThisRun: calls,
  computeRoutesCallsCumulative: store.read().computeRoutesCalls,
  placesCallsThisRun: 0,
  mapLoadsThisRun: 0,
  sku: "Routes: Compute Routes Essentials unless an intermediate stopover is billed as Pro",
  estimatedMarginalUsdCeiling: Number((calls * 0.01).toFixed(2)),
  candidates: candidates.map((candidate) => publicCandidate(candidate, measurements.some((item) => item.cnpj === candidate.cnpj && item.directDistanceMeters !== null))),
  measurements,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({
  calls,
  cumulative: summary.computeRoutesCallsCumulative,
  statuses: measurements.map((item) => ({ cnpj: item.cnpj, status: item.status, extraKm: item.extraDistanceMeters === null ? null : Number((item.extraDistanceMeters / 1000).toFixed(2)) })),
}, null, 2));

function publicCandidate(candidate: DetourCandidate, measured: boolean) {
  return {
    cnpj: candidate.cnpj,
    name: candidate.razaoSocial,
    municipio: candidate.municipio,
    uf: candidate.uf,
    brand: candidate.bandeira,
    band: candidate.band,
    locationQuality: candidate.locationQuality,
    progressKm: Number((candidate.progressMeters / 1000).toFixed(1)),
    straightLineKm: Number((candidate.distanceToRouteMeters / 1000).toFixed(2)),
    measured,
  };
}

function row(candidate: DetourCandidate, status: string, warning: string | null = null, partial: Partial<MeasurementRow> = {}): MeasurementRow {
  return {
    cnpj: candidate.cnpj,
    name: candidate.razaoSocial,
    municipio: candidate.municipio,
    uf: candidate.uf,
    brand: candidate.bandeira,
    status,
    warning,
    directDistanceMeters: null as number | null,
    viaDistanceMeters: null as number | null,
    extraDistanceMeters: null as number | null,
    directDurationSeconds: null as number | null,
    viaDurationSeconds: null as number | null,
    extraDrivingSeconds: null as number | null,
    fidelity: null as string | null,
    medianOffsetMeters: null as number | null,
    p95OffsetMeters: null as number | null,
    ...partial,
  };
}

interface MeasurementRow {
  cnpj: string;
  status: string;
  directDistanceMeters: number | null;
  extraDistanceMeters: number | null;
  [key: string]: unknown;
}

function readPriorMeasurements(filePath: string): MeasurementRow[] {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { measurements?: MeasurementRow[] };
    return Array.isArray(parsed.measurements) ? parsed.measurements : [];
  } catch {
    return [];
  }
}

function readEnv(filePath: string): Record<string, string> {
  const env: Record<string, string> = {};
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return env;
}
