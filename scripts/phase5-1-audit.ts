import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseAnpApiPayload } from "@/lib/route-overlay/stations/anp-api";
import { classifyFuelDescription } from "@/lib/route-overlay/stations/classify";
import { offsetMislabelsUtcClock, numericDifferences, parseInstant } from "@/lib/route-overlay/stations/chronology";
import { parseAnpCoordinate } from "@/lib/route-overlay/stations/coordinates";
import { parseAnpCsv } from "@/lib/route-overlay/stations/csv";
import { coverageGaps, flagCoordinatesFarFromSeat, csvKey, observeStations } from "@/lib/route-overlay/stations/report";
import { corridorBand, projectOntoPolyline } from "@/lib/route-overlay/stations/proximity";
import type { AnpApiRecord, AnpCsvRecord, CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

const root = process.cwd();
const anpDirectory = path.join(root, ".route-overlay", "anp");
const summary = JSON.parse(readFileSync(path.join(root, "data", "phase5-coverage-summary.json"), "utf8")) as CoverageSummary;
const observations = JSON.parse(readFileSync(path.join(anpDirectory, "station-observations.json"), "utf8")) as StationObservation[];
const route = JSON.parse(readFileSync(path.join(anpDirectory, "route-points.json"), "utf8")) as GeoPoint[];
const corridor = JSON.parse(readFileSync(path.join(anpDirectory, "corridor-municipalities.json"), "utf8")) as {
  municipalities: Array<{ uf: string; anpName: string }>;
};
const allowed = new Set(corridor.municipalities.map((item) => csvKey(item.uf, item.anpName)));
const bounds = routeBounds(route);

const recount = {
  premiumExplicit: observations.filter((station) => station.premium).length,
  premiumWithCoordinates: observations.filter((station) => station.premium && station.location).length,
  premiumWithin2Km: observations.filter((station) => station.premium && station.band === "0_2_km").length,
  premiumBetween2And5Km: observations.filter((station) => station.premium && station.band === "2_5_km").length,
  premiumUngeolocated: observations.filter((station) => station.premium && station.band === "ungeolocated").length,
  anyFuelWithin2Km: observations.filter((station) => station.band === "0_2_km").length,
  anyFuelBetween2And5Km: observations.filter((station) => station.band === "2_5_km").length,
  duplicateCnpj: observations.filter((station) => station.duplicateCnpj).length,
  duplicateLocation: observations.filter((station) => station.duplicateLocation).length,
};
const published = {
  premiumExplicit: summary.population.premiumExplicit,
  premiumWithCoordinates: summary.population.premiumWithCoordinates,
  premiumWithin2Km: summary.population.premiumWithin2Km,
  premiumBetween2And5Km: summary.population.premiumBetween2And5Km,
  premiumUngeolocated: summary.population.premiumUngeolocated,
  anyFuelWithin2Km: summary.population.anyFuelWithin2Km,
  anyFuelBetween2And5Km: summary.population.anyFuelBetween2And5Km,
  duplicateCnpj: summary.population.duplicateCnpj,
  duplicateLocation: summary.population.duplicateLocation,
};

const pages = auditPages();
const omission = auditOmissions();
const places = auditPlaces();
const source = recountFromSources();
const gaps = coverageGaps(observations, summary.route.brazilianLengthMeters).map((gap) => ({
  fromProgressMeters: Math.round(gap.fromProgressMeters),
  toProgressMeters: Math.round(gap.toProgressMeters),
  lengthMeters: Math.round(gap.lengthMeters),
}));
const publishedGaps = summary.gapsOver100Km.map((gap) => ({
  fromProgressMeters: Math.round(gap.fromProgressMeters),
  toProgressMeters: Math.round(gap.toProgressMeters),
  lengthMeters: Math.round(gap.lengthMeters),
}));
const csvStat = statSync(path.join(anpDirectory, "anp-revendedores-2026-11-17.csv"));
const analysisStat = statSync(path.join(anpDirectory, "station-observations.json"));
const summaryStat = statSync(path.join(root, "data", "phase5-coverage-summary.json"));
const placesStat = statSync(path.join(anpDirectory, "places-sample.json"));
  const chronology = {
  publishedGeneratedAt: summary.generatedAt,
  publishedGeneratedAtStatus: "HARDCODED",
  publishedCsvRetrievedAt: summary.sources.csvRetrievedAt,
  publishedCsvRetrievedAtStatus: offsetMislabelsUtcClock(summary.sources.csvRetrievedAt, csvStat.mtime.toISOString())
    ? "OFFSET_MISLABEL"
    : "UNVERIFIED",
  csvFilesystemWrittenAt: csvStat.mtime.toISOString(),
  claimedCsvInstant: instantIso(summary.sources.csvRetrievedAt),
  claimedCsvVersusFilesystemMinutes: minutesBetween(csvStat.mtime.toISOString(), summary.sources.csvRetrievedAt),
  publishedGenerationVersusClaimedCsvMinutes: minutesBetween(summary.generatedAt, summary.sources.csvRetrievedAt),
  publishedGenerationVersusAnalysisWriteMinutes: minutesBetween(summary.generatedAt, analysisStat.mtime.toISOString()),
  publishedGenerationPrecedesLatestApiFile: precedes(summary.generatedAt, pages.latest),
  analysisFilesystemWrittenAt: analysisStat.mtime.toISOString(),
  summaryFilesystemWrittenAt: summaryStat.mtime.toISOString(),
  placesSampleFilesystemWrittenAt: placesStat.mtime.toISOString(),
  apiFileSpan: {
    earliest: pages.earliest,
    latest: pages.latest,
  },
};

const audit = {
  chronology,
  reproducibility: {
    observationDifferences: numericDifferences(published, recount),
    observationCount: observations.length,
    publishedRegistered: summary.population.registeredInCorridorMunicipalities,
    publishedApiRecords: summary.population.apiRecordsInCorridorMunicipalities,
    source,
    gapDifferences: JSON.stringify(gaps) === JSON.stringify(publishedGaps) ? [] : [{ expected: publishedGaps, actual: gaps }],
  },
  pages,
  omission,
  places,
};
writeFileSync(path.join(root, "data", "phase5-1-reproducibility.json"), `${JSON.stringify(audit)}\n`);
const publishedPath = path.join(root, "data", "phase5-coverage-summary.json");
const publishedRaw = JSON.parse(readFileSync(publishedPath, "utf8")) as Record<string, unknown>;
publishedRaw.chronologyAudit = {
  publishedGeneratedAtStatus: "HARDCODED",
  publishedCsvRetrievedAtStatus: chronology.publishedCsvRetrievedAtStatus,
  csvFilesystemWrittenAt: chronology.csvFilesystemWrittenAt,
  analysisFilesystemWrittenAt: chronology.analysisFilesystemWrittenAt,
  apiFileSpan: chronology.apiFileSpan,
  note: "Historical generatedAt and csvRetrievedAt strings are unchanged. See docs/PHASE5_1_DATA_QUALITY_AUDIT.md.",
};
writeFileSync(publishedPath, `${JSON.stringify(publishedRaw)}\n`);
console.log(JSON.stringify({
  differences: audit.reproducibility.observationDifferences,
  sourceDifferences: source.differences,
  gapDifferences: audit.reproducibility.gapDifferences.length,
  stateDifferences: source.stateDifferences,
  brandDifferences: source.brandDifferences,
  cnpj: { missingFromApi: source.cnpjMissingFromApi, missingFromCsv: source.cnpjMissingFromCsv },
  omittedPremiumWithin5Km: omission.premiumWithin5Km,
  omittedPremiumWithin2Km: omission.premiumWithin2Km,
  omittedPremiumWithoutCoordinates: omission.premiumWithoutCoordinates,
  examinedOutside: omission.geolocatedOutsideSelectedMunicipalitiesNearRoute,
  pages: pages.files.length,
  incomplete: pages.incomplete,
  reduced: pages.reducedFiles.length,
  generationPrecedesLatestApi: chronology.publishedGenerationPrecedesLatestApiFile,
  claimedCsvVersusFilesystemMinutes: chronology.claimedCsvVersusFilesystemMinutes,
  publishedGenerationVersusClaimedCsvMinutes: chronology.publishedGenerationVersusClaimedCsvMinutes,
}, null, 2));

function recountFromSources() {
  const csv = parseAnpCsv(readFileSync(path.join(anpDirectory, "anp-revendedores-2026-11-17.csv")));
  const csvByCnpj = new Map<string, AnpCsvRecord>();
  const apiRecords: AnpApiRecord[] = [];
  let registered = 0;
  for (const record of csv.records) {
    if (!allowed.has(csvKey(record.uf, record.municipio))) {
      continue;
    }
    registered += 1;
    if (!csvByCnpj.has(record.cnpj)) {
      csvByCnpj.set(record.cnpj, record);
    }
  }
  for (const file of pages.files) {
    const page = parseAnpApiPayload(JSON.parse(readFileSync(path.join(root, file.file), "utf8")));
    apiRecords.push(...page.records.filter((record) => allowed.has(csvKey(record.uf, record.municipio))));
  }
  const seats = new Map<string, GeoPoint>();
  for (const row of readFileSync(path.join(anpDirectory, "municipios-brasileiros.csv"), "utf8").split(/\r?\n/).slice(1)) {
    const cells = row.split(",");
    const uf = { "35": "SP", "41": "PR", "42": "SC", "43": "RS" }[cells[5]];
    if (!uf || cells.length < 6) {
      continue;
    }
    seats.set(csvKey(uf, cells[1]), { latitude: Number(cells[2]), longitude: Number(cells[3]) });
  }
  const recomputed = flagCoordinatesFarFromSeat(
    observeStations({ apiRecords, csvByCnpj, route, asOf: new Date("2026-11-17T14:40:00.000Z") }),
    seats,
    route,
  );
  const metrics = {
    nationalCsvRecords: csv.records.length,
    registered,
    apiRecords: apiRecords.length,
    premiumExplicit: recomputed.filter((station) => station.premium).length,
    premiumWithCoordinates: recomputed.filter((station) => station.premium && station.location).length,
    premiumWithin2Km: recomputed.filter((station) => station.premium && station.band === "0_2_km").length,
    premiumBetween2And5Km: recomputed.filter((station) => station.premium && station.band === "2_5_km").length,
    premiumUngeolocated: recomputed.filter((station) => station.premium && station.band === "ungeolocated").length,
    anyFuelWithin2Km: recomputed.filter((station) => station.band === "0_2_km").length,
    anyFuelBetween2And5Km: recomputed.filter((station) => station.band === "2_5_km").length,
  };
  const byState = new Map<string, { registered: number; apiRecords: number; premium: number; premiumWithin5Km: number }>();
  for (const station of recomputed) {
    const row = byState.get(station.uf) ?? { registered: 0, apiRecords: 0, premium: 0, premiumWithin5Km: 0 };
    row.apiRecords += 1;
    if (station.premium) {
      row.premium += 1;
    }
    if (station.premium && (station.band === "0_2_km" || station.band === "2_5_km")) {
      row.premiumWithin5Km += 1;
    }
    byState.set(station.uf, row);
  }
  const stateDifferences = summary.byState.flatMap((row) => {
    const actual = byState.get(row.uf);
    if (!actual) {
      return [{ metric: `${row.uf}.missing`, expected: row.apiRecords, actual: 0 }];
    }
    return numericDifferences(
      { apiRecords: row.apiRecords, premium: row.premium, premiumWithin5Km: row.premiumWithin5Km },
      { apiRecords: actual.apiRecords, premium: actual.premium, premiumWithin5Km: actual.premiumWithin5Km },
    ).map((difference) => ({ ...difference, metric: `${row.uf}.${difference.metric}` }));
  });
  const byBrand = new Map<string, { premium: number; premiumWithin5Km: number }>();
  for (const station of recomputed) {
    if (!station.premium) {
      continue;
    }
    const row = byBrand.get(station.bandeira) ?? { premium: 0, premiumWithin5Km: 0 };
    row.premium += 1;
    if (station.band === "0_2_km" || station.band === "2_5_km") {
      row.premiumWithin5Km += 1;
    }
    byBrand.set(station.bandeira, row);
  }
  const brandDifferences = summary.byBrand.flatMap((row) => {
    const actual = byBrand.get(row.brand) ?? { premium: 0, premiumWithin5Km: 0 };
    return numericDifferences(
      { premium: row.premium, premiumWithin5Km: row.premiumWithin5Km },
      actual,
    ).map((difference) => ({ ...difference, metric: `${row.brand}.${difference.metric}` }));
  });
  const apiCnpj = new Set(apiRecords.map((record) => record.cnpj));
  const missingFromApi = [...csvByCnpj.keys()].filter((cnpj) => !apiCnpj.has(cnpj)).length;
  const missingFromCsv = [...apiCnpj].filter((cnpj) => !csvByCnpj.has(cnpj)).length;
  return {
    metrics,
    differences: numericDifferences({
      nationalCsvRecords: summary.population.nationalCsvRecords,
      registered: summary.population.registeredInCorridorMunicipalities,
      apiRecords: summary.population.apiRecordsInCorridorMunicipalities,
      premiumExplicit: summary.population.premiumExplicit,
      premiumWithCoordinates: summary.population.premiumWithCoordinates,
      premiumWithin2Km: summary.population.premiumWithin2Km,
      premiumBetween2And5Km: summary.population.premiumBetween2And5Km,
      premiumUngeolocated: summary.population.premiumUngeolocated,
      anyFuelWithin2Km: summary.population.anyFuelWithin2Km,
      anyFuelBetween2And5Km: summary.population.anyFuelBetween2And5Km,
    }, metrics),
    cnpjMissingFromApi: missingFromApi,
    cnpjMissingFromCsv: missingFromCsv,
    stateDifferences,
    brandDifferences,
  };
}

function auditPages() {
  const files: Array<{
    file: string;
    bytes: number;
    sha256: string;
    writtenAt: string;
    rows: number;
    totalRecords: number;
    totalPages: number;
    page: number;
    complete: boolean;
    retainsTankCapacity: boolean;
    scope: "full_state" | "municipality";
  }> = [];
  const stateFiles = ["PR-1.json", "SC-1.json", "RS-1.json"].map((name) => path.join(anpDirectory, "api", name));
  const spFiles = readdirSync(path.join(anpDirectory, "api", "sp"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => path.join(anpDirectory, "api", "sp", name));
  for (const filePath of [...stateFiles, ...spFiles]) {
    const bytes = readFileSync(filePath);
    const payload = JSON.parse(bytes.toString("utf8")) as unknown;
    const page = parseAnpApiPayload(payload);
    files.push({
      file: path.relative(root, filePath).replaceAll("\\", "/"),
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      writtenAt: statSync(filePath).mtime.toISOString(),
      rows: page.records.length,
      totalRecords: page.totalRecords,
      totalPages: page.totalPages,
      page: page.page,
      complete: page.records.length === page.totalRecords && page.totalPages === 1,
      retainsTankCapacity: bytes.includes(Buffer.from("tancagem")),
      scope: filePath.includes(`${path.sep}sp${path.sep}`) ? "municipality" : "full_state",
    });
  }
  const written = files.map((file) => file.writtenAt).sort();
  return {
    files,
    reducedFiles: files.filter((file) => !file.retainsTankCapacity).map((file) => file.file),
    incomplete: files.filter((file) => !file.complete).map((file) => file.file),
    earliest: written[0] ?? null,
    latest: written[written.length - 1] ?? null,
  };
}

function auditOmissions() {
  let examined = 0;
  let premiumWithin2Km = 0;
  let premiumWithin5Km = 0;
  let premiumWithoutCoordinates = 0;
  const examples: Array<{ cnpj: string; municipio: string; uf: string; distanceMeters: number; band: string }> = [];
  for (const fileName of ["PR-1.json", "SC-1.json", "RS-1.json"]) {
    const page = parseAnpApiPayload(JSON.parse(readFileSync(path.join(anpDirectory, "api", fileName), "utf8")));
    for (const record of page.records) {
      if (allowed.has(csvKey(record.uf, record.municipio))) {
        continue;
      }
      const location = parseAnpCoordinate(
        record.coordinateText.latitude,
        record.coordinateText.longitude,
        record.validationText,
      );
      const premium = record.produtos.some((product) => classifyFuelDescription(product.produto) === "PREMIUM_GASOLINE");
      if (!location.point || outsideBounds(location.point, bounds)) {
        if (premium && !location.point) {
          premiumWithoutCoordinates += 1;
        }
        continue;
      }
      examined += 1;
      const projection = projectOntoPolyline(location.point, route);
      if (!projection) {
        continue;
      }
      const band = corridorBand(projection.distanceMeters);
      if (!premium || (band !== "0_2_km" && band !== "2_5_km")) {
        continue;
      }
      if (band === "0_2_km") {
        premiumWithin2Km += 1;
      }
      premiumWithin5Km += 1;
      if (examples.length < 10) {
        examples.push({
          cnpj: record.cnpj,
          municipio: record.municipio,
          uf: record.uf,
          distanceMeters: Math.round(projection.distanceMeters),
          band,
        });
      }
    }
  }
  return {
    statesWithCompletePages: ["PR", "SC", "RS"],
    saoPaulo: "UNKNOWN",
    geolocatedOutsideSelectedMunicipalitiesNearRoute: examined,
    premiumWithin2Km,
    premiumWithin5Km,
    premiumWithoutCoordinates,
    examples,
  };
}

function auditPlaces() {
  const sample = JSON.parse(readFileSync(path.join(anpDirectory, "places-sample.json"), "utf8")) as Array<{
    decision: string;
    regularHours: boolean;
    currentHours: boolean;
    requestSent: boolean;
    error: string | null;
  }>;
  const counts = {
    requested: sample.filter((item) => item.requestSent).length,
    matchConfirmed: sample.filter((item) => item.decision === "MATCH_CONFIRMED").length,
    reviewRequired: sample.filter((item) => item.decision === "MATCH_REVIEW_REQUIRED").length,
    rejected: sample.filter((item) => item.decision === "MATCH_REJECTED").length,
    notFound: sample.filter((item) => item.decision === "MATCH_NOT_FOUND").length,
    regularHoursReturned: sample.filter((item) => item.regularHours).length,
    currentHoursReturned: sample.filter((item) => item.currentHours).length,
    errors: sample.filter((item) => item.error).length,
  };
  return {
    counts,
    differences: numericDifferences(
      {
        requested: summary.places?.requested ?? -1,
        matchConfirmed: summary.places?.matchConfirmed ?? -1,
        reviewRequired: summary.places?.reviewRequired ?? -1,
        rejected: summary.places?.rejected ?? -1,
        notFound: summary.places?.notFound ?? -1,
        regularHoursReturned: summary.places?.regularHoursReturned ?? -1,
        currentHoursReturned: summary.places?.currentHoursReturned ?? -1,
        errors: 0,
      },
      counts,
    ),
    coordinateDisagreement: "UNKNOWN",
    reason: "The Places responses and candidate coordinates were not retained. A confirmed decision records that the matcher ran; it does not retain the measured distance.",
  };
}

function precedes(left: string | null, right: string | null): boolean | null {
  const leftMs = left ? parseInstant(left) : null;
  const rightMs = right ? parseInstant(right) : null;
  if (leftMs === null || rightMs === null) {
    return null;
  }
  return leftMs < rightMs;
}

function minutesBetween(earlier: string, later: string): number | null {
  const start = parseInstant(earlier);
  const end = parseInstant(later);
  if (start === null || end === null) {
    return null;
  }
  return Math.round((end - start) / 60000);
}

function instantIso(value: string): string | null {
  const parsed = parseInstant(value);
  return parsed === null ? null : new Date(parsed).toISOString();
}

function routeBounds(points: GeoPoint[]) {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  return {
    south: Math.min(...latitudes) - 0.08,
    north: Math.max(...latitudes) + 0.08,
    west: Math.min(...longitudes) - 0.08,
    east: Math.max(...longitudes) + 0.08,
  };
}

function outsideBounds(point: GeoPoint, box: ReturnType<typeof routeBounds>): boolean {
  return point.latitude < box.south || point.latitude > box.north || point.longitude < box.west || point.longitude > box.east;
}
