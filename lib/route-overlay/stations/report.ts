import { isValidCnpj } from "@/lib/route-overlay/stations/cnpj";
import { classifyProducts, hasExplicitPodium, hasExplicitPremium } from "@/lib/route-overlay/stations/classify";
import { parseAnpCoordinate } from "@/lib/route-overlay/stations/coordinates";
import { findDuplicateCnpjs, findDuplicateLocations } from "@/lib/route-overlay/stations/identity";
import { haversineMeters } from "@/lib/route-overlay/geo";
import { corridorBand, projectOntoPolyline } from "@/lib/route-overlay/stations/proximity";
import { freshnessConfidence, identityConfidence, premiumConfidence } from "@/lib/route-overlay/stations/quality";
import { fold } from "@/lib/route-overlay/stations/text";
import type {
  AnpApiRecord,
  AnpCsvRecord,
  CoverageGap,
  CoverageSummary,
  PublicStation,
  RouteProvenance,
  StationObservation,
} from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

const FAR_FROM_SEAT_METERS = 80_000;

export interface CorridorGeometry {
  provenance: RouteProvenance;
  brazilianPoints: GeoPoint[];
  brazilianLengthMeters: number;
  borderApproachMeters: number;
  borderClipReliable: boolean;
  longSegmentCount: number;
}

export function observeStations(input: {
  apiRecords: AnpApiRecord[];
  csvByCnpj: Map<string, AnpCsvRecord>;
  route: GeoPoint[];
  asOf: Date;
}): StationObservation[] {
  const duplicateCnpjs = findDuplicateCnpjs(input.apiRecords.map((record) => record.cnpj));
  const draft = input.apiRecords.map((record) => toObservation(record, input));
  const duplicateLocations = findDuplicateLocations(
    draft.map((station) => ({ id: station.cnpj || station.codigoSimp, location: station.location })),
  );
  return draft.map((station) => ({
    ...station,
    duplicateCnpj: duplicateCnpjs.has(station.cnpj),
    duplicateLocation: duplicateLocations.has(station.cnpj || station.codigoSimp),
  }));
}

export function flagCoordinatesFarFromSeat(
  stations: StationObservation[],
  seats: Map<string, GeoPoint>,
  route: GeoPoint[],
): StationObservation[] {
  return stations.map((station) => {
    if (!station.location) {
      return station;
    }
    const seat = seats.get(csvKey(station.uf, station.municipio));
    if (!seat || haversineMeters(station.location, seat) <= FAR_FROM_SEAT_METERS) {
      return station;
    }
    const projection = projectOntoPolyline(station.location, route);
    return {
      ...station,
      locationQuality: "LOW",
      distanceToRouteMeters: projection ? projection.distanceMeters : null,
      progressMeters: projection ? projection.progressMeters : null,
      band: corridorBand(projection ? projection.distanceMeters : null),
      longSegment: projection ? projection.longSegment : false,
    };
  });
}

export function coverageGaps(
  stations: Array<Pick<StationObservation, "premium" | "band" | "progressMeters">>,
  routeLengthMeters: number,
  minimumGapMeters = 100_000,
): CoverageGap[] {
  const covered = stations
    .filter((station) => station.premium && (station.band === "0_2_km" || station.band === "2_5_km"))
    .map((station) => station.progressMeters)
    .filter((progress): progress is number => progress !== null)
    .sort((left, right) => left - right);
  const points = [0, ...covered, routeLengthMeters];
  const gaps: CoverageGap[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const lengthMeters = points[index] - points[index - 1];
    if (lengthMeters >= minimumGapMeters) {
      gaps.push({
        fromProgressMeters: points[index - 1],
        toProgressMeters: points[index],
        lengthMeters,
      });
    }
  }
  return gaps;
}

export function representativeStations(stations: StationObservation[], limit = 12): PublicStation[] {
  const premium = stations
    .filter((station) => station.premium)
    .sort((left, right) => (left.progressMeters ?? Number.POSITIVE_INFINITY) - (right.progressMeters ?? Number.POSITIVE_INFINITY));
  if (premium.length <= limit) {
    return premium.map(publicStation);
  }
  const chosen: StationObservation[] = [];
  for (let index = 0; index < limit; index += 1) {
    chosen.push(premium[Math.round((index * (premium.length - 1)) / (limit - 1))]);
  }
  return chosen.map(publicStation);
}

export function summarizeCoverage(input: {
  generatedAt: string;
  geometry: CorridorGeometry;
  nationalCsvRecords: number;
  corridorMunicipalities: number;
  registeredInCorridorMunicipalities: number;
  registeredByState: Map<string, number>;
  observations: StationObservation[];
  apiPagesRetrieved: number;
  sources: CoverageSummary["sources"];
  limitations: string[];
}): CoverageSummary {
  const premium = input.observations.filter((station) => station.premium);
  const states = new Set<string>([
    ...input.registeredByState.keys(),
    ...input.observations.map((station) => station.uf),
  ]);
  const brands = new Map<string, { premium: number; premiumWithin5Km: number }>();
  for (const station of premium) {
    const brand = station.bandeira || "(blank)";
    const current = brands.get(brand) ?? { premium: 0, premiumWithin5Km: 0 };
    current.premium += 1;
    if (station.band === "0_2_km" || station.band === "2_5_km") {
      current.premiumWithin5Km += 1;
    }
    brands.set(brand, current);
  }
  return {
    generatedAt: input.generatedAt,
    route: {
      ...input.geometry.provenance,
      brazilianPointCount: input.geometry.brazilianPoints.length,
      brazilianLengthMeters: input.geometry.brazilianLengthMeters,
      borderApproachMeters: input.geometry.borderApproachMeters,
      borderClipReliable: input.geometry.borderClipReliable,
      longSegmentCount: input.geometry.longSegmentCount,
    },
    sources: input.sources,
    population: {
      nationalCsvRecords: input.nationalCsvRecords,
      corridorMunicipalities: input.corridorMunicipalities,
      registeredInCorridorMunicipalities: input.registeredInCorridorMunicipalities,
      apiRecordsInCorridorMunicipalities: input.observations.length,
      apiPagesRetrieved: input.apiPagesRetrieved,
      premiumExplicit: premium.length,
      podiumText: input.observations.filter((station) => station.podiumText).length,
      premiumWithCoordinates: premium.filter((station) => station.location).length,
      premiumWithin2Km: premium.filter((station) => station.band === "0_2_km").length,
      premiumBetween2And5Km: premium.filter((station) => station.band === "2_5_km").length,
      premiumUngeolocated: premium.filter((station) => station.band === "ungeolocated").length,
      anyFuelWithin2Km: input.observations.filter((station) => station.band === "0_2_km").length,
      anyFuelBetween2And5Km: input.observations.filter((station) => station.band === "2_5_km").length,
      coordinateConflicts: input.observations.filter((station) => station.locationQuality === "LOW").length,
      duplicateCnpj: input.observations.filter((station) => station.duplicateCnpj).length,
      duplicateLocation: input.observations.filter((station) => station.duplicateLocation).length,
      sigafMarked: input.observations.filter((station) => station.sigafStatus.trim().length > 0).length,
    },
    byState: [...states].sort().map((uf) => ({
      uf,
      registered: input.registeredByState.get(uf) ?? 0,
      apiRecords: input.observations.filter((station) => station.uf === uf).length,
      premium: premium.filter((station) => station.uf === uf).length,
      premiumWithin5Km: premium.filter((station) => station.uf === uf && (station.band === "0_2_km" || station.band === "2_5_km")).length,
    })),
    byBrand: [...brands.entries()]
      .map(([brand, counts]) => ({ brand, ...counts }))
      .sort((left, right) => right.premium - left.premium || left.brand.localeCompare(right.brand)),
    gapsOver100Km: coverageGaps(input.observations, input.geometry.brazilianLengthMeters),
    representativeStations: representativeStations(input.observations),
    corridorPremiumStations: input.observations
      .filter((station) => station.premium && (station.band === "0_2_km" || station.band === "2_5_km"))
      .sort((left, right) => (left.progressMeters ?? 0) - (right.progressMeters ?? 0))
      .map(publicStation),
    places: null,
    limitations: input.limitations,
  };
}

function publicStation(station: StationObservation): PublicStation {
  return {
    cnpj: station.cnpj,
    razaoSocial: station.razaoSocial,
    municipio: station.municipio,
    uf: station.uf,
    bandeira: station.bandeira,
    premiumDescriptions: station.products
      .filter((product) => product.classification === "PREMIUM_GASOLINE" || product.classification === "PODIUM_SPECIFIC")
      .map((product) => product.raw),
    latitude: station.location ? Number(station.location.latitude.toFixed(6)) : null,
    longitude: station.location ? Number(station.location.longitude.toFixed(6)) : null,
    distanceToRouteMeters: station.distanceToRouteMeters === null ? null : Math.round(station.distanceToRouteMeters),
    progressMeters: station.progressMeters === null ? null : Math.round(station.progressMeters),
    band: station.band,
    locationQuality: station.locationQuality,
    validationText: station.validationText,
    obtainedOn: station.obtainedOn,
    identityConfidence: station.identityConfidence,
    sigafStatus: station.sigafStatus,
  };
}

export function csvKey(uf: string, municipio: string): string {
  return `${uf.toUpperCase()}|${fold(municipio)}`;
}

function toObservation(
  record: AnpApiRecord,
  input: { csvByCnpj: Map<string, AnpCsvRecord>; route: GeoPoint[]; asOf: Date },
): StationObservation {
  const products = classifyProducts(record.produtos.map((product) => product.produto));
  const coordinate = parseAnpCoordinate(
    record.coordinateText.latitude,
    record.coordinateText.longitude,
    record.validationText,
  );
  const projection = coordinate.point ? projectOntoPolyline(coordinate.point, input.route) : null;
  const csv = input.csvByCnpj.get(record.cnpj);
  const premium = hasExplicitPremium(products);
  return {
    cnpj: record.cnpj,
    codigoSimp: record.codigoSimp,
    razaoSocial: record.razaoSocial,
    endereco: record.endereco,
    municipio: record.municipio,
    uf: record.uf,
    bandeira: record.distribuidora || csv?.bandeira || "",
    products,
    premium,
    podiumText: hasExplicitPodium(products),
    location: coordinate.point,
    locationQuality: coordinate.quality,
    coordinateSource: coordinate.point ? "anp_api" : "missing",
    validationText: record.validationText,
    obtainedOn: record.obtainedOn,
    informationOrigin: record.informationOrigin,
    sigafStatus: record.sigafStatus,
    distanceToRouteMeters: projection ? projection.distanceMeters : null,
    progressMeters: projection ? projection.progressMeters : null,
    band: corridorBand(projection ? projection.distanceMeters : null),
    longSegment: projection ? projection.longSegment : false,
    duplicateCnpj: false,
    duplicateLocation: false,
    identityConfidence: identityConfidence(
      csv,
      isValidCnpj(record.cnpj)
        ? { cnpj: record.cnpj, razaoSocial: record.razaoSocial, municipio: record.municipio, uf: record.uf }
        : undefined,
    ),
    premiumConfidence: premiumConfidence(premium, record.produtos.length > 0),
    freshness: freshnessConfidence(record.obtainedOn, input.asOf),
  };
}
