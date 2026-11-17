export interface HoursSnapshot {
  source: "google_regular" | "google_current" | "independent";
  weekdayDescriptions: string[];
  periodCount: number;
}

export type HoursCrossCheck =
  | "missing"
  | "not_cross_checked"
  | "consistent"
  | "conflicting"
  | "uncertain";

export function interpretOpeningHours(value: unknown, source: HoursSnapshot["source"]): HoursSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const descriptions = Array.isArray(record.weekdayDescriptions)
    ? record.weekdayDescriptions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const periods = Array.isArray(record.periods) ? record.periods.length : 0;
  if (descriptions.length === 0 && periods === 0) {
    return null;
  }
  return { source, weekdayDescriptions: descriptions, periodCount: periods };
}

/**
 * Google hours are not treated as verified. An independent published schedule
 * is required before a record can be called consistent or conflicting.
 */
export function crossCheckHours(
  google: HoursSnapshot | null,
  independent: HoursSnapshot | null,
): HoursCrossCheck {
  if (!google && !independent) {
    return "missing";
  }
  if (!google || !independent) {
    return "not_cross_checked";
  }
  if (google.weekdayDescriptions.length === 0 || independent.weekdayDescriptions.length === 0) {
    return "uncertain";
  }
  const left = google.weekdayDescriptions.map(normalizeHours).join("|");
  const right = independent.weekdayDescriptions.map(normalizeHours).join("|");
  return left === right ? "consistent" : "conflicting";
}

function normalizeHours(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
