import type {
  FidelityDiagnostic,
  ParsedMapsUrl,
  ReconstructionSource,
  ReconstructedRoute,
} from "@/lib/route-overlay/types";

export function diagnoseFidelity(
  parsed: ParsedMapsUrl,
  routes: ReconstructedRoute[],
  source: ReconstructionSource,
): FidelityDiagnostic {
  const origin = parsed.stops.find((stop) => stop.role === "origin");
  const destination = parsed.stops.find((stop) => stop.role === "destination");
  const viaCount = parsed.stops.filter((stop) => stop.via).length;
  const comparison = {
    stopsRecovered: parsed.stops.length,
    coordinatesRecovered: parsed.stops.filter((stop) => stop.location).length,
    polylineInSource: Boolean(parsed.encodedPolyline),
    routeTokenInSource: Boolean(parsed.routeToken),
    alternativeCount: routes.length,
    alternativesAreDistinctGeometries: distinctGeometries(routes),
  };

  if (!origin || !destination) {
    return {
      verdict: "insufficient_stops",
      selectedRoutePreserved: false,
      headline:
        "The originally selected route was not preserved. Origin and destination were not both recovered.",
      reasons: [
        "Without both endpoints there is no route alternative to restore or to recompute.",
      ],
      comparison,
    };
  }

  const reasons: string[] = [];
  if (parsed.encodedPolyline) {
    reasons.push(
      "The URL carried an encoded polyline. Standard Google Maps share links do not. That geometry can be drawn directly. A recomputed route is still a separate path.",
    );
  } else {
    reasons.push(
      "The shared URL did not include the encoded polyline of the alternative that was on screen.",
    );
    reasons.push(
      "The shared URL did not include a Google route token, which is the value the Routes API uses to refer to one computed route.",
    );
    if (viaCount > 0) {
      reasons.push(
        "Via points force the corridor through recovered coordinates, but roads between those points can still differ. The selected alternative was not identified.",
      );
    } else if (routes.length > 1) {
      reasons.push(
        `Reconstruction produced ${routes.length} alternatives. The URL does not say which one was selected.`,
      );
    } else {
      reasons.push(
        "Nothing in the URL records which alternative the person chose when several roads connect the same stops.",
      );
    }
  }

  if (source === "mock") {
    reasons.push(
      "This reconstruction is mock data generated on this machine. It is not a Google route and cannot prove a match.",
    );
  } else {
    reasons.push(
      "The Google Routes API computed this response from the recovered stops at request time. It was not told which alternative had been selected in Maps.",
    );
  }

  if (parsed.encodedPolyline) {
    return {
      verdict: "polyline_in_url",
      selectedRoutePreserved: true,
      headline:
        "The link itself contained a polyline, so that geometry was preserved. Recomputed alternatives are still new routes.",
      reasons,
      comparison,
    };
  }

  if (viaCount > 0) {
    return {
      verdict: "constrained_not_proven",
      selectedRoutePreserved: false,
      headline:
        "The originally selected route was not preserved. Via points only constrain the corridor.",
      reasons,
      comparison,
    };
  }

  return {
    verdict: "not_preserved",
    selectedRoutePreserved: false,
    headline: "The originally selected route was not preserved.",
    reasons,
    comparison,
  };
}

function distinctGeometries(routes: ReconstructedRoute[]): boolean {
  const lines = routes
    .map((route) => route.encodedPolyline)
    .filter((line): line is string => Boolean(line));
  return new Set(lines).size > 1;
}
