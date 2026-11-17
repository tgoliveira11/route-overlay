import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseAnpApiPayload } from "@/lib/route-overlay/stations/anp-api";
import { parseAnpCsv } from "@/lib/route-overlay/stations/csv";
import {
  flagCoordinatesFarFromSeat,
  csvKey,
  observeStations,
  summarizeCoverage,
} from "@/lib/route-overlay/stations/report";
import type { AnpApiRecord, AnpCsvRecord, RouteProvenance } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

const root = process.cwd();
const anpDirectory = path.join(root, ".route-overlay", "anp");
const corridor = JSON.parse(readFileSync(path.join(anpDirectory, "corridor-municipalities.json"), "utf8")) as {
  route: RouteProvenance & {
    brazilianPointCount: number;
    brazilianLengthMeters: number;
    borderApproachMeters: number;
    borderClipReliable: boolean;
    longSegmentCount: number;
  };
  municipalities: Array<{ anpName: string; uf: string; location?: GeoPoint; name: string }>;
};
const seats = new Map<string, GeoPoint>();
const seatRows = readFileSync(path.join(anpDirectory, "municipios-brasileiros.csv"), "utf8").split(/\r?\n/).slice(1);
const ufByCode: Record<string, string> = { "35": "SP", "41": "PR", "42": "SC", "43": "RS" };
for (const row of seatRows) {
  const cells = row.split(",");
  if (cells.length < 6 || !ufByCode[cells[5]]) {
    continue;
  }
  seats.set(csvKey(ufByCode[cells[5]], cells[1]), {
    latitude: Number(cells[2]),
    longitude: Number(cells[3]),
  });
}

const allowed = new Set(corridor.municipalities.map((item) => csvKey(item.uf, item.anpName)));
const csvBytes = readFileSync(path.join(anpDirectory, "anp-revendedores-2026-11-17.csv"));
const csv = parseAnpCsv(csvBytes);
const csvByCnpj = new Map<string, AnpCsvRecord>();
const registeredByState = new Map<string, number>();
let registered = 0;
for (const record of csv.records) {
  if (!allowed.has(csvKey(record.uf, record.municipio))) {
    continue;
  }
  registered += 1;
  registeredByState.set(record.uf, (registeredByState.get(record.uf) ?? 0) + 1);
  if (!csvByCnpj.has(record.cnpj)) {
    csvByCnpj.set(record.cnpj, record);
  }
}

const apiRecords: AnpApiRecord[] = [];
let pages = 0;
for (const fileName of ["PR-1.json", "SC-1.json", "RS-1.json"]) {
  const page = parseAnpApiPayload(JSON.parse(readFileSync(path.join(anpDirectory, "api", fileName), "utf8")));
  pages += 1;
  apiRecords.push(...page.records.filter((record) => allowed.has(csvKey(record.uf, record.municipio))));
}
const spDirectory = path.join(anpDirectory, "api", "sp");
for (const fileName of readdirSync(spDirectory).filter((name) => name.endsWith(".json") && name !== "inline-pages.json")) {
  const page = parseAnpApiPayload(JSON.parse(readFileSync(path.join(spDirectory, fileName), "utf8")));
  pages += 1;
  apiRecords.push(...page.records.filter((record) => allowed.has(csvKey(record.uf, record.municipio))));
}
const inlinePath = path.join(spDirectory, "inline-pages.json");
try {
  const inlinePages = JSON.parse(readFileSync(inlinePath, "utf8")) as unknown[];
  for (const payload of inlinePages) {
    const page = parseAnpApiPayload(payload);
    pages += 1;
    apiRecords.push(...page.records.filter((record) => allowed.has(csvKey(record.uf, record.municipio))));
  }
} catch {
  // São Paulo pages may be stored as individual response files instead.
}

const trace = JSON.parse(readFileSync(path.join(anpDirectory, "route-points.json"), "utf8")) as GeoPoint[];
const asOf = new Date();
const csvWrittenAt = statSync(path.join(anpDirectory, "anp-revendedores-2026-11-17.csv")).mtime.toISOString();
const observations = flagCoordinatesFarFromSeat(
  observeStations({ apiRecords, csvByCnpj, route: trace, asOf }),
  seats,
  trace,
);
const summary = summarizeCoverage({
  generatedAt: asOf.toISOString(),
  geometry: {
    provenance: {
      label: corridor.route.label,
      scenarioId: corridor.route.scenarioId,
      candidateId: corridor.route.candidateId,
      description: corridor.route.description,
      distanceMeters: corridor.route.distanceMeters,
      durationSeconds: corridor.route.durationSeconds,
      pointCount: corridor.route.pointCount,
      confirmedGeometryAvailable: false,
      fidelity: "UNVERIFIED",
    },
    brazilianPoints: trace,
    brazilianLengthMeters: corridor.route.brazilianLengthMeters,
    borderApproachMeters: corridor.route.borderApproachMeters,
    borderClipReliable: corridor.route.borderClipReliable,
    longSegmentCount: corridor.route.longSegmentCount,
  },
  nationalCsvRecords: csv.records.length,
  corridorMunicipalities: corridor.municipalities.length,
  registeredInCorridorMunicipalities: registered,
  registeredByState,
  observations,
  apiPagesRetrieved: pages,
  sources: {
    csvUrl: "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/arquivos-dados-cadastrais-dos-revendedores-varejistas-de-combustiveis-automotivos/dados-cadastrais-revendedores-varejistas-combustiveis-automoveis.csv",
    csvSha256: createHash("sha256").update(csvBytes).digest("hex"),
    csvBytes: csvBytes.length,
    csvEncoding: csv.encoding,
    csvPublishedLabel: "Page updated 17/11/2026 09:29; CSV link labeled updated 17/11/2026",
    csvRetrievedAt: csvWrittenAt,
    apiUrl: "https://revendedoresapi.anp.gov.br/v1/combustivel",
    apiRetrievedAt: asOf.toISOString(),
    apiBlockedFromLocalNetwork: true,
  },
  limitations: [
    "The cached Google default geometry was analyzed. The browser-confirmed polyline was not persisted, so this is not that confirmed revision.",
    "Google labeled the route BR-116. Sampled coordinates also follow the Santa Catarina coast before turning inland toward Porto Alegre and Jaguarão.",
    "The Brazilian portion ends at the polyline vertex nearest the Phase 4 Jaguarão reference. Uruguay is outside ANP coverage.",
    "Corridor municipalities are those whose municipal seat is nearest a route sample or within 20 km of the polyline. This is not a municipal-boundary intersection.",
    "ANP coordinates that are more than 80 km from the claimed municipal seat are low quality. Straight-line distance is not a driving detour.",
    "No ANP record in this retrieval contained an explicit Podium product name. Brand Vibra is not Podium evidence.",
    "Authorized tank volume is not evidence of fuel in stock.",
  ],
});

const dataDirectory = path.join(root, "data");
mkdirSync(dataDirectory, { recursive: true });
const summaryPath = path.join(dataDirectory, "phase5-coverage-summary.json");
try {
  const previous = JSON.parse(readFileSync(summaryPath, "utf8")) as { places?: typeof summary.places; limitations?: string[] };
  if (previous.places) {
    summary.places = previous.places;
  }
  if (Array.isArray(previous.limitations)) {
    for (const limitation of previous.limitations) {
      if (!summary.limitations.includes(limitation)) {
        summary.limitations.push(limitation);
      }
    }
  }
} catch {
  // The first analysis run creates the summary.
}
writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);
writeFileSync(path.join(anpDirectory, "station-observations.json"), `${JSON.stringify(observations)}\n`);
console.log(JSON.stringify(summary.population));
