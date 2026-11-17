import { fold } from "@/lib/route-overlay/stations/text";
import type { ClassifiedProduct, GasolineClass } from "@/lib/route-overlay/stations/types";

/**
 * Classify one source description. Authorized tank capacity is not stock,
 * and a distributor brand is not a product.
 */
export function classifyFuelDescription(raw: string): ClassifiedProduct["classification"] {
  const text = fold(raw);
  if (!text) {
    return "UNKNOWN";
  }

  const podium = text.includes("PODIUM");
  const gasoline = text.includes("GASOLINA");
  const diesel = text.includes("DIESEL") || text.includes("OLEO");
  const ethanol = text.includes("ETANOL");
  const naturalGas = text.includes("GAS NATURAL") || text === "GNV";
  if ((diesel || ethanol || naturalGas) && !gasoline) {
    return podium ? "UNKNOWN" : "NOT_GASOLINE";
  }
  if (!gasoline && podium) {
    return "PODIUM_SPECIFIC";
  }
  if (!gasoline) {
    return "NOT_GASOLINE";
  }

  const premium = text.includes("PREMIUM") || text.includes("ALTA OCTANAGEM");
  const additive = text.includes("ADITIV");
  const regular = text.includes("COMUM");
  if (podium) {
    return "PODIUM_SPECIFIC";
  }
  // ANP publishes "GASOLINA C PREMIUM ADITIVADA" as an explicit premium grade.
  // The raw description is preserved, so the additive qualifier is not discarded.
  if (premium) {
    return "PREMIUM_GASOLINE";
  }
  if (additive) {
    return "ADDITIVE_GASOLINE";
  }
  if (regular) {
    return "REGULAR_GASOLINE";
  }
  return "UNKNOWN";
}

export function classifyProducts(rawDescriptions: string[]): ClassifiedProduct[] {
  return rawDescriptions.map((raw) => ({
    raw,
    classification: classifyFuelDescription(raw),
  }));
}

export function hasExplicitPremium(products: ClassifiedProduct[]): boolean {
  return products.some((product) => product.classification === "PREMIUM_GASOLINE");
}

export function hasExplicitPodium(products: ClassifiedProduct[]): boolean {
  return products.some((product) => product.classification === "PODIUM_SPECIFIC");
}

export function gasolineClasses(products: ClassifiedProduct[]): GasolineClass[] {
  return products
    .map((product) => product.classification)
    .filter((value): value is GasolineClass => value !== "NOT_GASOLINE");
}
