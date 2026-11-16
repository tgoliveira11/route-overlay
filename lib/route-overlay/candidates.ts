import type {
  ParsedMapsUrl,
  ReconstructedRoute,
  ReconstructionResult,
} from "@/lib/route-overlay/types";

export type CandidateKind =
  | "mock_candidate"
  | "mock_waypoint_fallback"
  | "live_alternative"
  | "live_only_route";

export interface RouteCandidate {
  id: string;
  route: ReconstructedRoute;
  kind: CandidateKind;
  selectable: boolean;
  /** False when the corridor has no geometry the user could compare. */
  confirmable: boolean;
  limitation: string | null;
}

export interface CandidateSet {
  candidates: RouteCandidate[];
  alternativesAvailable: boolean;
  limitation: string | null;
}

export function intermediateCount(parsed: ParsedMapsUrl): number {
  return parsed.stops.filter(
    (stop) => stop.role === "waypoint" || stop.role === "via",
  ).length;
}

/**
 * Choose which reconstructed lines the assisted flow may offer.
 * Mock detours are not shown once intermediate waypoints fix the order.
 * Live results are never padded with synthetic alternatives.
 */
export function presentCandidates(
  parsed: ParsedMapsUrl,
  reconstruction: ReconstructionResult,
): CandidateSet {
  const intermediates = intermediateCount(parsed);
  const routes = reconstruction.routes.filter((route) => route.encodedPolyline);
  const waypointLimit =
    "Intermediate waypoints are set. The Routes API does not return alternative routes in that case. This flow keeps waypoint order and does not invent extra alternatives.";

  if (reconstruction.mock && intermediates > 0) {
    const primary = routes.find((route) => route.isDefaultAlternative) ?? routes[0];
    return {
      candidates: primary ? [toCandidate(primary, "mock_waypoint_fallback", waypointLimit)] : [],
      alternativesAvailable: false,
      limitation: waypointLimit,
    };
  }

  if (reconstruction.mock) {
    return {
      candidates: routes.map((route) =>
        toCandidate(
          route,
          "mock_candidate",
          "Synthetic fixture. This is not a Google route and it is not the alternative that was selected in Maps.",
        ),
      ),
      alternativesAvailable: routes.length > 1,
      limitation:
        routes.length > 1
          ? "These are labeled mock corridors for comparison. Selecting one does not prove it matches Google Maps."
          : "Mock mode produced one schematic corridor.",
    };
  }

  if (intermediates > 0) {
    return {
      candidates: routes.map((route) => toCandidate(route, "live_only_route", waypointLimit)),
      alternativesAvailable: false,
      limitation: waypointLimit,
    };
  }

  return {
    candidates: routes.map((route) =>
      toCandidate(
        route,
        "live_alternative",
        "Computed by the Google Routes API from the recovered stops. It is a new route, not a replay of the shared selection.",
      ),
    ),
    alternativesAvailable: routes.length > 1,
    limitation:
      routes.length > 0
        ? "Google may return fewer than three alternatives. The shared selection is still not identified."
        : "The Routes API returned no route.",
  };
}

function toCandidate(
  route: ReconstructedRoute,
  kind: CandidateKind,
  limitation: string,
): RouteCandidate {
  return {
    id: route.id,
    route,
    kind,
    selectable: true,
    confirmable: Boolean(route.encodedPolyline),
    limitation,
  };
}
