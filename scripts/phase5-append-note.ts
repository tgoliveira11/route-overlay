import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CoverageSummary } from "@/lib/route-overlay/stations/types";

const summaryPath = path.join(process.cwd(), "data", "phase5-coverage-summary.json");
const summary = JSON.parse(readFileSync(summaryPath, "utf8")) as CoverageSummary;
const note = "Public Petrobras locator sample on 2026-11-17, filtered to Gasolina Petrobras Podium, confirmed four ANP premium Vibra stations by address: Posto Gloria in Joinville, Auto Posto Santa Catarina and Posto Modesto 2 in Itapema, and Oceano Atlantico in Santos. Their ANP text says premium gasoline and does not say Podium. A Jaguarão search showed no named markers after two zoom-outs; that view does not prove that no station exists. The sample does not estimate the Podium share of the 157 premium Vibra stations.";
if (!summary.limitations.some((item) => item.startsWith("Public Petrobras locator sample"))) {
  summary.limitations.push(note);
}
writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`);
console.log(summary.limitations.length);
