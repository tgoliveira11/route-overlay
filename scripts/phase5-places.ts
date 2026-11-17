import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { filePhase5BudgetStore } from "@/lib/route-overlay/stations/budget";
import { crossCheckHours } from "@/lib/route-overlay/stations/hours";
import { matchPlaceCandidate } from "@/lib/route-overlay/stations/places-match";
import { lookupStationPlace } from "@/lib/route-overlay/stations/places-client";
import type { CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";

const root = process.cwd();
const observations = JSON.parse(
  readFileSync(path.join(root, ".route-overlay", "anp", "station-observations.json"), "utf8"),
) as StationObservation[];
const sample = selectSample(observations);
const apiKey = readPlacesKey();
const store = filePhase5BudgetStore(path.join(root, ".route-overlay", "phase5-budget.json"));
const results = [];

for (const station of sample) {
  const lookup = await lookupStationPlace(
    {
      textQuery: `${station.razaoSocial}, ${station.endereco}, ${station.municipio}, ${station.uf}, posto`,
      apiKey,
    },
    store,
  );
  const decision = lookup.error ? "MATCH_NOT_FOUND" : matchPlaceCandidate(
    {
      name: station.razaoSocial,
      address: station.endereco,
      municipality: station.municipio,
      state: station.uf,
      location: station.location,
      brand: station.bandeira,
    },
    lookup.candidate,
  );
  results.push({
    cnpj: station.cnpj,
    uf: station.uf,
    municipio: station.municipio,
    bandeira: station.bandeira,
    band: station.band,
    locationQuality: station.locationQuality,
    decision: lookup.error ? "ERROR" : decision,
    regularHours: Boolean(lookup.regularHours),
    currentHours: Boolean(lookup.currentHours),
    hoursCrossCheck: crossCheckHours(lookup.regularHours, null),
    error: lookup.error,
    requestSent: lookup.requestSent,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
}

const summaryPath = path.join(root, "data", "phase5-coverage-summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary;
const decided = results.filter((item) => item.requestSent && !item.error);
summary.places = {
  requested: results.filter((item) => item.requestSent).length,
  matchConfirmed: decided.filter((item) => item.decision === "MATCH_CONFIRMED").length,
  reviewRequired: decided.filter((item) => item.decision === "MATCH_REVIEW_REQUIRED").length,
  rejected: decided.filter((item) => item.decision === "MATCH_REJECTED").length,
  notFound: decided.filter((item) => item.decision === "MATCH_NOT_FOUND").length,
  regularHoursReturned: decided.filter((item) => item.regularHours).length,
  currentHoursReturned: decided.filter((item) => item.currentHours).length,
  hoursCrossChecked: 0,
  hoursConflicting: 0,
  hoursMissing: decided.filter((item) => !item.regularHours).length,
  sku: "Places API Text Search Enterprise",
  fieldMask: "places.id,places.displayName,places.formattedAddress,places.location,places.businessStatus,places.regularOpeningHours,places.currentOpeningHours",
  estimatedWorstCaseUsd: Number((results.filter((item) => item.requestSent).length * 0.035).toFixed(2)),
  observedCostUsd: null,
};
summary.limitations.push(
  "Google Places was used only for a stratified sample. Returned hours were not cross-checked against an independent published schedule.",
  "The Places key is restricted to Places API (New) and has no application restriction because the local egress address was not treated as stable.",
);
writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);
writeFileSync(path.join(root, ".route-overlay", "anp", "places-sample.json"), `${JSON.stringify(results)}\n`);
const errors = results.filter((item) => item.error).length;
console.log(JSON.stringify({ requested: summary.places.requested, errors, decisions: summary.places }));

function selectSample(stations: StationObservation[]): StationObservation[] {
  const pool = stations
    .filter((station) => station.premium && station.location && (station.band === "0_2_km" || station.band === "2_5_km"))
    .sort((left, right) => (left.progressMeters ?? 0) - (right.progressMeters ?? 0));
  const chosen: StationObservation[] = [];
  const seen = new Set<string>();
  const take = (predicate: (station: StationObservation) => boolean) => {
    const station = pool.find((item) => !seen.has(item.cnpj) && predicate(item));
    if (!station) {
      return;
    }
    seen.add(station.cnpj);
    chosen.push(station);
  };
  for (const uf of ["SP", "PR", "SC", "RS"]) {
    take((station) => station.uf === uf && station.band === "2_5_km");
    take((station) => station.uf === uf && station.band === "0_2_km" && station.bandeira === "VIBRA");
    take((station) => station.uf === uf && station.band === "0_2_km" && station.bandeira === "IPIRANGA");
  }
  for (const brand of ["RAIZEN", "RAIZEN MIME", "BANDEIRA BRANCA", "CHARRUA"]) {
    take((station) => station.bandeira === brand);
  }
  take((station) => station.locationQuality === "LOW");
  const step = Math.max(1, Math.floor(pool.length / 6));
  for (let index = 0; chosen.length < 18 && index < pool.length; index += step) {
    take((station) => station.cnpj === pool[index].cnpj);
  }
  return chosen.slice(0, 18);
}

function readPlacesKey(): string {
  const env = readFileSync(path.join(root, ".env.local"), "utf8");
  const match = env.match(/^GOOGLE_PLACES_API_KEY=(.+)$/m);
  if (!match || match[1].trim().length < 20) {
    throw new Error("Places key is not configured.");
  }
  return match[1].trim();
}
