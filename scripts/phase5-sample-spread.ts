import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const root = process.cwd();
const observations = JSON.parse(
  readFileSync(path.join(root, ".route-overlay", "anp", "station-observations.json"), "utf8"),
) as StationObservation[];
const sampled = new Set([
  "58190083000109", "73032088000105", "51645646000167", "75026807000100", "78901915000670",
  "78901915001722", "54595207000185", "12702707000129", "83646984008275", "02670376000139",
  "33753491000109", "01433908000151", "60279695000114", "11127350000130", "44980530000119",
  "50852636000130", "57984437000124", "17898787000153",
]);
const pool = observations.filter((station) =>
  station.premium && station.location && (station.band === "0_2_km" || station.band === "2_5_km") && !sampled.has(station.cnpj),
);
const low = observations.filter((station) => station.premium && station.locationQuality === "LOW");
const lines = pool
  .sort((left, right) => (left.progressMeters ?? 0) - (right.progressMeters ?? 0))
  .filter((_, index) => index % 8 === 0)
  .map((station) => [
    Math.round((station.progressMeters ?? 0) / 1000),
    station.uf,
    station.municipio,
    station.bandeira,
    station.band,
    station.locationQuality,
    station.cnpj,
  ].join(" | "));
const lowLines = low.map((station) => [
  Math.round((station.progressMeters ?? 0) / 1000),
  station.uf,
  station.municipio,
  station.bandeira,
  station.band,
  station.cnpj,
].join(" | "));
writeFileSync(
  path.join(root, ".route-overlay", "anp", "sample-spread.txt"),
  [`POOL ${pool.length}`, ...lines, "LOW", ...lowLines].join("\n"),
);
console.log(`pool ${pool.length} low ${low.length} lines ${lines.length}`);
