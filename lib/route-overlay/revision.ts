import type { ParsedMapsUrl } from "@/lib/route-overlay/types";

/**
 * Identity of the constraints that produced a reconstruction.
 * A geometry may be confirmed only when this value still matches the draft.
 */
export function routingRevision(parsed: ParsedMapsUrl): string {
  return JSON.stringify({
    travelMode: parsed.travelMode,
    avoid: parsed.avoid,
    stops: parsed.stops.map((stop) => ({
      role: stop.role,
      via: stop.via,
      placeId: stop.placeId,
      label: stop.label,
      latitude: stop.location?.latitude ?? null,
      longitude: stop.location?.longitude ?? null,
    })),
  });
}

export function isCurrentRouteRequest(
  startedGeneration: number,
  currentGeneration: number,
  startedRevision: string,
  currentRevision: string,
): boolean {
  return startedGeneration === currentGeneration && startedRevision === currentRevision;
}

export function confirmationEligibility(input: {
  draftRevision: string | null;
  geometryRevision: string | null;
  mock: boolean;
  mapsDisplayReady: boolean;
  candidateConfirmable: boolean;
}): { allowed: boolean; reason: string } {
  if (!input.draftRevision || input.draftRevision !== input.geometryRevision) {
    return {
      allowed: false,
      reason:
        "The draft changed after this geometry was calculated. Recalculate before confirming.",
    };
  }
  if (!input.mock && !input.mapsDisplayReady) {
    return {
      allowed: false,
      reason:
        "Live Google geometry is not drawn on a Google map, so it cannot be confirmed. Mock confirmation remains available.",
    };
  }
  if (!input.candidateConfirmable) {
    return {
      allowed: false,
      reason: "This candidate has no geometry to confirm.",
    };
  }
  return {
    allowed: true,
    reason: "The selected geometry matches the current draft.",
  };
}
