import { readFileSync } from "node:fs";
import path from "node:path";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const observations = JSON.parse(readFileSync(path.join(process.cwd(), ".route-overlay", "anp", "station-observations.json"), "utf8")) as StationObservation[];
const places = JSON.parse(readFileSync(path.join(process.cwd(), ".route-overlay", "anp", "places-sample.json"), "utf8")) as Array<{ cnpj: string; decision: string }>;
const placeDecision = new Map(places.map((item) => [item.cnpj, item.decision]));
const corridor = observations
  .filter((station) => station.premium && (station.band === "0_2_km" || station.band === "2_5_km") && station.progressMeters !== null)
  .sort((left, right) => (left.progressMeters ?? 0) - (right.progressMeters ?? 0));

function nearestBefore(progress: number): StationObservation | undefined {
  return [...corridor].reverse().find((station) => (station.progressMeters ?? 0) < progress);
}

function nearestAfter(progress: number): StationObservation | undefined {
  return corridor.find((station) => (station.progressMeters ?? 0) > progress);
}

const wantedBrands = ["VIBRA", "IPIRANGA", "RAIZEN", "RAIZEN MIME", "BANDEIRA BRANCA", "CHARRUA", "SIM DISTRIBUIDOR"];
const chosen: StationObservation[] = [];
const reasons = new Map<string, string>();

function add(station: StationObservation | undefined, reason: string) {
  if (!station || chosen.some((item) => item.cnpj === station.cnpj)) {
    return;
  }
  chosen.push(station);
  reasons.set(station.cnpj, reason);
}

add(corridor[0], "Start of the Brazilian clip");
add(corridor.find((station) => station.band === "2_5_km"), "Early station in the 2–5 km band");
add(nearestBefore(217_834), "Last premium station before the first gap");
add(nearestAfter(334_699), "First premium station after the first gap");
for (const brand of wantedBrands) {
  add(corridor.find((station) => station.bandeira === brand && station.progressMeters! > 400_000 && station.progressMeters! < 1_200_000), `${brand} on the middle of the route`);
}
add(corridor.find((station) => station.progressMeters! > 1_100_000 && station.progressMeters! < 1_300_000 && station.band === "0_2_km"), "Porto Alegre approach, 0–2 km");
add(nearestBefore(1_388_675), "Last premium station before the second gap");
add(corridor.find((station) => station.band === "2_5_km" && station.progressMeters! > 1_000_000), "Southern 2–5 km station");

const rows = chosen.slice(0, 15).map((station) => ({
  cnpj: station.cnpj,
  name: station.razaoSocial,
  municipio: station.municipio,
  uf: station.uf,
  brand: station.bandeira,
  products: station.products.filter((product) => product.classification === "PREMIUM_GASOLINE").map((product) => product.raw),
  coordinateSource: station.coordinateSource,
  validationText: station.validationText,
  locationQuality: station.locationQuality,
  distanceMeters: Math.round(station.distanceToRouteMeters ?? -1),
  progressKm: Math.round((station.progressMeters ?? 0) / 1000),
  band: station.band,
  placesDecision: placeDecision.get(station.cnpj) ?? null,
  reason: reasons.get(station.cnpj),
}));
console.log(JSON.stringify(rows, null, 2));
console.error(`candidates ${corridor.length} listed ${rows.length}`);
