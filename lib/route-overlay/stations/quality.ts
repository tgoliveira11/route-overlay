import { identitiesAgree } from "@/lib/route-overlay/stations/identity";
import { isValidCnpj } from "@/lib/route-overlay/stations/cnpj";
import type { AnpCsvRecord, Confidence } from "@/lib/route-overlay/stations/types";

export function identityConfidence(
  csv: AnpCsvRecord | undefined,
  api: { cnpj: string; razaoSocial: string; municipio: string; uf: string } | undefined,
): Confidence {
  if (!api && csv && isValidCnpj(csv.cnpj)) {
    return "MEDIUM";
  }
  if (!api || !isValidCnpj(api.cnpj)) {
    return "LOW";
  }
  if (!csv) {
    return "MEDIUM";
  }
  return identitiesAgree(csv, api) ? "HIGH" : "CONFLICTING";
}

export function premiumConfidence(explicitPremium: boolean, productsKnown: boolean): Confidence {
  if (!productsKnown) {
    return "UNKNOWN";
  }
  return explicitPremium ? "HIGH" : "MISSING";
}

export function freshnessConfidence(obtainedOn: string, asOf: Date): Confidence {
  const parsed = parseBrazilianDate(obtainedOn);
  if (!parsed) {
    return "UNKNOWN";
  }
  const ageDays = (asOf.getTime() - parsed.getTime()) / 86_400_000;
  if (ageDays < 0) {
    return "UNKNOWN";
  }
  if (ageDays <= 365) {
    return "HIGH";
  }
  if (ageDays <= 730) {
    return "MEDIUM";
  }
  return "LOW";
}

function parseBrazilianDate(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const date = new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  return Number.isNaN(date.getTime()) ? null : date;
}
