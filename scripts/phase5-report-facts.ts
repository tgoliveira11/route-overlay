import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSummary, StationObservation } from "@/lib/route-overlay/stations/types";

const root = process.cwd();
const summary = JSON.parse(readFileSync(path.join(root, "data", "phase5-coverage-summary.json"), "utf8")) as CoverageSummary;
const observations = JSON.parse(readFileSync(path.join(root, ".route-overlay", "anp", "station-observations.json"), "utf8")) as StationObservation[];
const sample = JSON.parse(readFileSync(path.join(root, ".route-overlay", "anp", "places-sample.json"), "utf8")) as Array<{ cnpj: string }>;
const byCnpj = new Map(observations.map((station) => [station.cnpj, station]));
const checked = sample.map((item) => {
  const station = byCnpj.get(item.cnpj);
  return station ? {
    cnpj: station.cnpj,
    name: station.razaoSocial,
    city: `${station.municipio}/${station.uf}`,
    brand: station.bandeira,
    products: station.products.filter((product) => product.classification === "PREMIUM_GASOLINE").map((product) => product.raw),
    identity: station.identityConfidence,
    location: station.locationQuality,
    freshness: station.freshness,
    validation: station.validationText,
    obtainedOn: station.obtainedOn,
    distanceKm: station.distanceToRouteMeters === null ? null : Number((station.distanceToRouteMeters / 1000).toFixed(2)),
    progressKm: station.progressMeters === null ? null : Math.round(station.progressMeters / 1000),
    duplicateLocation: station.duplicateLocation,
    sigaf: station.sigafStatus || "empty",
  } : null;
});
const facts = {
  generatedAt: summary.generatedAt,
  route: summary.route,
  sources: summary.sources,
  population: summary.population,
  byState: summary.byState,
  byBrand: summary.byBrand,
  gaps: summary.gapsOver100Km,
  places: summary.places,
  limitations: summary.limitations,
  representative: summary.representativeStations.map((station) => ({
    cnpj: station.cnpj,
    name: station.razaoSocial,
    city: `${station.municipio}/${station.uf}`,
    brand: station.bandeira,
    products: station.premiumDescriptions,
    lat: station.latitude,
    lng: station.longitude,
    distanceKm: station.distanceToRouteMeters === null ? null : Number((station.distanceToRouteMeters / 1000).toFixed(2)),
    progressKm: station.progressMeters === null ? null : Math.round(station.progressMeters / 1000),
    band: station.band,
    location: station.locationQuality,
    identity: station.identityConfidence,
    validation: station.validationText,
    obtainedOn: station.obtainedOn,
  })),
  checked,
};
writeFileSync(path.join(root, ".route-overlay", "anp", "report-facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
console.log("facts", checked.length, summary.representativeStations.length);
