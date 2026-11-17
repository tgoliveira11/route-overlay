import { isValidCnpj, normalizeCnpj } from "@/lib/route-overlay/stations/cnpj";
import { haversineMeters } from "@/lib/route-overlay/geo";
import { fold } from "@/lib/route-overlay/stations/text";
import type { AnpCsvRecord } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

export interface DuplicateSets {
  duplicateCnpjs: Set<string>;
  duplicateLocations: Set<string>;
}

export function findDuplicateCnpjs(cnpjs: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const value of cnpjs) {
    const cnpj = normalizeCnpj(value);
    if (!cnpj) {
      continue;
    }
    counts.set(cnpj, (counts.get(cnpj) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([cnpj]) => cnpj));
}

export function findDuplicateLocations(
  stations: Array<{ id: string; location: GeoPoint | null }>,
  withinMeters = 50,
): Set<string> {
  const located = stations.filter((station): station is { id: string; location: GeoPoint } => station.location !== null);
  const duplicates = new Set<string>();
  for (let left = 0; left < located.length; left += 1) {
    for (let right = left + 1; right < located.length; right += 1) {
      if (haversineMeters(located[left].location, located[right].location) <= withinMeters) {
        duplicates.add(located[left].id);
        duplicates.add(located[right].id);
      }
    }
  }
  return duplicates;
}

export function identitiesAgree(csv: AnpCsvRecord | undefined, api: { cnpj: string; razaoSocial: string; municipio: string; uf: string }): boolean {
  if (!csv || normalizeCnpj(csv.cnpj) !== normalizeCnpj(api.cnpj) || !isValidCnpj(api.cnpj)) {
    return false;
  }
  return fold(csv.municipio) === fold(api.municipio) && csv.uf.toUpperCase() === api.uf.toUpperCase() && fold(csv.razaoSocial) === fold(api.razaoSocial);
}
