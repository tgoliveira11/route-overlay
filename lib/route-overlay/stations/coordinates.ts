import type { GeoPoint } from "@/lib/route-overlay/types";
import type { Confidence } from "@/lib/route-overlay/stations/types";

const BRAZIL_LATITUDE = { min: -35, max: 6 };
const BRAZIL_LONGITUDE = { min: -75, max: -32 };

export interface ParsedCoordinate {
  point: GeoPoint | null;
  quality: Confidence;
  swapped: boolean;
  reason: string;
}

export function parseAnpCoordinate(
  latitudeText: string,
  longitudeText: string,
  validationText: string,
): ParsedCoordinate {
  const latitude = parseDecimal(latitudeText);
  const longitude = parseDecimal(longitudeText);
  if (latitude === null || longitude === null) {
    return {
      point: null,
      quality: "MISSING",
      swapped: false,
      reason: "ANP did not provide a decimal coordinate.",
    };
  }
  const swapped = looksSwapped(latitude, longitude);
  const point = swapped
    ? { latitude: longitude, longitude: latitude }
    : { latitude, longitude };
  if (!inRange(point)) {
    return {
      point: null,
      quality: "LOW",
      swapped,
      reason: "Coordinate is outside the accepted Brazil range.",
    };
  }
  const validated = foldValidation(validationText).includes("VALIDADA") &&
    !foldValidation(validationText).includes("NAO VALIDADA");
  return {
    point,
    quality: swapped ? "LOW" : validated ? "HIGH" : "MEDIUM",
    swapped,
    reason: swapped
      ? "Latitude and longitude appeared to be reversed and were swapped."
      : validated
        ? "ANP validation text says the position was validated."
        : "ANP supplied a coordinate but did not mark it as validated.",
  };
}

function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function looksSwapped(latitude: number, longitude: number): boolean {
  const asGiven = inRange({ latitude, longitude });
  const reversed = inRange({ latitude: longitude, longitude: latitude });
  return !asGiven && reversed;
}

function inRange(point: GeoPoint): boolean {
  return (
    point.latitude >= BRAZIL_LATITUDE.min &&
    point.latitude <= BRAZIL_LATITUDE.max &&
    point.longitude >= BRAZIL_LONGITUDE.min &&
    point.longitude <= BRAZIL_LONGITUDE.max
  );
}

function foldValidation(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
