/**
 * Timestamp checks for research artifacts.
 * A filesystem mtime is evidence of a local write, not an upstream publication time.
 */

export interface ChronologyEvent {
  name: string;
  instant: string;
}

export interface ChronologyViolation {
  earlier: string;
  later: string;
  earlierInstant: string;
  laterInstant: string;
}

const OFFSET_INSTANT = /^(.*T\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function parseInstant(value: string): number | null {
  if (!OFFSET_INSTANT.test(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * True when a zoned timestamp reuses the UTC wall clock and then applies a
 * non-zero offset, moving the absolute instant by that offset.
 */
export function offsetMislabelsUtcClock(claimed: string, filesystemUtc: string): boolean {
  const claimedMatch = OFFSET_INSTANT.exec(claimed);
  const fileMatch = OFFSET_INSTANT.exec(filesystemUtc);
  if (!claimedMatch || !fileMatch || claimedMatch[2] === "Z" || fileMatch[2] !== "Z") {
    return false;
  }
  if (claimedMatch[1] !== fileMatch[1]) {
    return false;
  }
  const claimedInstant = parseInstant(claimed);
  const fileInstant = parseInstant(filesystemUtc);
  return claimedInstant !== null && fileInstant !== null && claimedInstant !== fileInstant;
}

export function chronologyViolations(events: ChronologyEvent[]): ChronologyViolation[] {
  const parsed = events.map((event) => ({ ...event, ms: parseInstant(event.instant) }));
  const violations: ChronologyViolation[] = [];
  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1];
    const current = parsed[index];
    if (previous.ms === null || current.ms === null) {
      continue;
    }
    if (current.ms < previous.ms) {
      violations.push({
        earlier: previous.name,
        later: current.name,
        earlierInstant: previous.instant,
        laterInstant: current.instant,
      });
    }
  }
  return violations;
}

export function numericDifferences(
  expected: Record<string, number>,
  actual: Record<string, number>,
): Array<{ metric: string; expected: number; actual: number }> {
  const metrics = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  return metrics
    .filter((metric) => expected[metric] !== actual[metric])
    .map((metric) => ({ metric, expected: expected[metric], actual: actual[metric] }));
}
