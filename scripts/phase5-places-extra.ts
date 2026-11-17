import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { filePhase5BudgetStore } from "@/lib/route-overlay/stations/budget";
import { crossCheckHours } from "@/lib/route-overlay/stations/hours";
import { matchPlaceCandidate } from "@/lib/route-overlay/stations/places-match";
import { lookupStationPlace } from "@/lib/route-overlay/stations/places-client";
import type { CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";

const extraCnpjs = [
  "00984942000151",
  "75176859000317",
  "07473735015880",
  "18436138000284",
  "05298376000148",
  "41645591000131",
];

const root = process.cwd();
const observations = JSON.parse(
  readFileSync(path.join(root, ".route-overlay", "anp", "station-observations.json"), "utf8"),
) as StationObservation[];
const byCnpj = new Map(observations.map((station) => [station.cnpj, station]));
const sample = extraCnpjs.map((cnpj) => {
  const station = byCnpj.get(cnpj);
  if (!station) {
    throw new Error(`Missing station ${cnpj}`);
  }
  return station;
});
const apiKey = readPlacesKey();
const store = filePhase5BudgetStore(path.join(root, ".route-overlay", "phase5-budget.json"));
const samplePath = path.join(root, ".route-overlay", "anp", "places-sample.json");
const existing = JSON.parse(readFileSync(samplePath, "utf8")) as Array<Record<string, unknown>>;
const seen = new Set(existing.map((item) => String(item.cnpj)));

for (const station of sample) {
  if (seen.has(station.cnpj)) {
    continue;
  }
  const lookup = await lookupStationPlace(
    {
      textQuery: `${station.razaoSocial}, ${station.endereco}, ${station.municipio}, ${station.uf}, posto`,
      apiKey,
    },
    store,
  );
  const decision = lookup.error
    ? "ERROR"
    : matchPlaceCandidate(
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
  existing.push({
    cnpj: station.cnpj,
    uf: station.uf,
    municipio: station.municipio,
    bandeira: station.bandeira,
    band: station.band,
    locationQuality: station.locationQuality,
    decision,
    regularHours: Boolean(lookup.regularHours),
    currentHours: Boolean(lookup.currentHours),
    hoursCrossCheck: crossCheckHours(lookup.regularHours, null),
    error: lookup.error,
    requestSent: lookup.requestSent,
  });
  await new Promise((resolve) => setTimeout(resolve, 800));
}

const decided = existing.filter((item) => item.requestSent && !item.error);
const summaryPath = path.join(root, "data", "phase5-coverage-summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary;
summary.places = {
  requested: existing.filter((item) => item.requestSent).length,
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
  estimatedWorstCaseUsd: Number((existing.filter((item) => item.requestSent).length * 0.035).toFixed(2)),
  observedCostUsd: null,
};
writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);
writeFileSync(samplePath, `${JSON.stringify(existing)}\n`);
console.log(JSON.stringify(summary.places));

function readPlacesKey(): string {
  const env = readFileSync(path.join(root, ".env.local"), "utf8");
  const match = env.match(/^GOOGLE_PLACES_API_KEY=(.+)$/m);
  if (!match || match[1].trim().length < 20) {
    throw new Error("Places key is not configured.");
  }
  return match[1].trim();
}
