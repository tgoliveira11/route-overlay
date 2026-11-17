import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const observations = JSON.parse(
  readFileSync(path.join(process.cwd(), ".route-overlay", "anp", "station-observations.json"), "utf8"),
) as StationObservation[];
const premium = observations.filter((station) => station.premium);
const count = (items: StationObservation[], field: "freshness" | "locationQuality" | "identityConfidence" | "premiumConfidence") => {
  const totals: Record<string, number> = {};
  for (const item of items) {
    totals[item[field]] = (totals[item[field]] ?? 0) + 1;
  }
  return totals;
};
const validation = new Map<string, number>();
for (const station of premium.filter((item) => item.location)) {
  const key = station.validationText || "(empty)";
  validation.set(key, (validation.get(key) ?? 0) + 1);
}
const vibra = premium.filter((station) => station.bandeira === "VIBRA" && (station.band === "0_2_km" || station.band === "2_5_km"));
writeFileSync(path.join(process.cwd(), ".route-overlay", "anp", "quality-counts.json"), JSON.stringify({
  premium: premium.length,
  freshness: count(premium, "freshness"),
  location: count(premium, "locationQuality"),
  identity: count(premium, "identityConfidence"),
  premiumConfidence: count(premium, "premiumConfidence"),
  validation: Object.fromEntries(validation),
  vibraCorridor: vibra.length,
}, null, 2));
console.log("quality written", premium.length, vibra.length);
