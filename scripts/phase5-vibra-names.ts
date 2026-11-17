import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const ids = [
  "17898787000153", "12702707000129", "58190083000109", "73032088000105",
  "78901915000670", "33753491000109", "57984437000124", "00984942000151",
  "18436138000284", "05298376000148", "41645591000131", "83646984007899",
  "05294302000133",
];
const observations = JSON.parse(
  readFileSync(path.join(process.cwd(), ".route-overlay", "anp", "station-observations.json"), "utf8"),
) as StationObservation[];
const byCnpj = new Map(observations.map((station) => [station.cnpj, station]));
const lines = ids.map((id) => {
  const station = byCnpj.get(id);
  if (!station) return `${id} MISSING`;
  return [id, station.razaoSocial, station.endereco, station.municipio, station.uf, station.products.map((product) => product.raw).join(" / ")].join(" | ");
});
writeFileSync(path.join(process.cwd(), ".route-overlay", "anp", "vibra-sample.txt"), lines.join("\n"));
console.log(lines.length);
