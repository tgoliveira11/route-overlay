import { stopTitle } from "@/lib/route-overlay/geo";
import type {
  FieldStatus,
  ParsedMapsUrl,
  RecoverabilityItem,
  RecoverabilityReport,
  RouteStop,
} from "@/lib/route-overlay/types";

export function assessRecoverability(parsed: ParsedMapsUrl): RecoverabilityReport {
  const origin = parsed.stops.find((stop) => stop.role === "origin");
  const destination = parsed.stops.find((stop) => stop.role === "destination");
  const intermediates = parsed.stops.filter(
    (stop) => stop.role === "waypoint" || stop.role === "via",
  );
  const withCoordinates = parsed.stops.filter((stop) => stop.location);
  const withPlaceIds = parsed.stops.filter((stop) => stop.placeId);
  const geometryPresentInUrl = Boolean(parsed.encodedPolyline);

  const items: RecoverabilityItem[] = [
    stopItem("origin", "Origin", origin),
    stopItem("destination", "Destination", destination),
    {
      id: "waypoints",
      field: "Intermediate stops",
      status: intermediates.length > 0 ? "recovered" : "not_encoded",
      detail:
        intermediates.length > 0
          ? intermediates
              .map((stop) => {
                const kind = stop.via ? "via" : "stopover";
                return `${stopTitle(stop)} (${kind})`;
              })
              .join("; ")
          : "The URL does not list any waypoint or via point.",
    },
    {
      id: "stop-order",
      field: "Stop order",
      status: origin && destination ? "recovered" : "missing",
      detail:
        origin && destination
          ? "Stops were read from left to right, which is the order Google Maps encodes."
          : "Order is not meaningful until both endpoints are present.",
    },
    {
      id: "coordinates",
      field: "Coordinates",
      status:
        withCoordinates.length === 0
          ? "not_encoded"
          : withCoordinates.length === parsed.stops.length
            ? "recovered"
            : "partial",
      detail:
        withCoordinates.length === 0
          ? "No latitude/longitude pairs were attached to the stops. Place names alone cannot be drawn without a geocoder."
          : `${withCoordinates.length} of ${parsed.stops.length} stops have coordinates. Data-blob pairs are longitude then latitude. Query pairs are latitude then longitude.`,
    },
    {
      id: "place-ids",
      field: "Place identifiers",
      status: withPlaceIds.length > 0 ? placeIdStatus(parsed) : "not_encoded",
      detail:
        withPlaceIds.length > 0
          ? withPlaceIds.map((stop) => stop.placeId).join(", ")
          : "No place id was present in a documented parameter or in the data blob.",
    },
    travelModeItem(parsed),
    {
      id: "avoid",
      field: "Avoid tolls, highways, ferries",
      status: avoidStatus(parsed),
      detail: avoidDetail(parsed),
    },
    {
      id: "departure-time",
      field: "Departure time",
      status: departureStatus(parsed),
      detail: departureDetail(parsed),
    },
    {
      id: "selected-alternative",
      field: "Selected alternative",
      status: alternativeStatus(parsed),
      detail: alternativeDetail(parsed),
    },
    {
      id: "encoded-polyline",
      field: "Encoded polyline",
      status: parsed.encodedPolyline ? "recovered" : "not_encoded",
      detail: parsed.encodedPolyline
        ? parsed.polylineFromExtension
          ? "An explicit polyline parameter was present. Standard Google Maps share links do not include the chosen geometry."
          : "A polyline was present on the URL."
        : "The chosen road geometry is not part of a Google Maps share URL.",
    },
    {
      id: "route-token",
      field: "Route token",
      status: parsed.routeToken ? "partial" : "not_encoded",
      detail: parsed.routeToken
        ? "A route_token parameter was present. The public share sheet does not issue a Routes API route token."
        : "A route token is what the Routes API would need to replay one specific route. Share links do not carry it.",
    },
    {
      id: "traffic",
      field: "Traffic at share time",
      status: "not_encoded",
      detail:
        "Live and historical traffic are not stored in the URL. Any later computation sees different roads and durations.",
    },
  ];

  const canReconstructStops = Boolean(
    origin &&
      destination &&
      hasHandle(origin) &&
      hasHandle(destination) &&
      parsed.kind !== "short_link" &&
      parsed.kind !== "invalid" &&
      parsed.kind !== "unsupported",
  );

  return {
    items,
    canReconstructStops,
    geometryPresentInUrl,
    summary: summarize(parsed, origin, destination, intermediates, canReconstructStops),
  };
}

function stopItem(
  id: string,
  field: string,
  stop: RouteStop | undefined,
): RecoverabilityItem {
  if (!stop || !hasHandle(stop)) {
    return {
      id,
      field,
      status: "missing",
      detail: `${field} was not present in the URL.`,
    };
  }
  return {
    id,
    field,
    status: "recovered",
    detail: describeStop(stop),
  };
}

function describeStop(stop: RouteStop): string {
  const parts = [stopTitle(stop)];
  if (stop.location && stop.label) {
    parts.push(
      `${stop.location.latitude.toFixed(4)}, ${stop.location.longitude.toFixed(4)}`,
    );
  }
  if (stop.placeId) {
    parts.push(`place id ${stop.placeId}`);
  }
  parts.push(`source: ${stop.source}`);
  return parts.join(" · ");
}

function hasHandle(stop: RouteStop): boolean {
  return Boolean(stop.label || stop.location || stop.placeId);
}

function placeIdStatus(parsed: ParsedMapsUrl): FieldStatus {
  const fromDocumentedQuery = parsed.stops.some(
    (stop) => stop.placeId && (stop.source === "query" || stop.source === "legacy"),
  );
  return fromDocumentedQuery ? "recovered" : "partial";
}

function travelModeItem(parsed: ParsedMapsUrl): RecoverabilityItem {
  if (!parsed.travelMode) {
    return {
      id: "travel-mode",
      field: "Travel mode",
      status: "not_encoded",
      detail: "The URL does not say whether the route was driving, walking, cycling, or transit.",
    };
  }
  return {
    id: "travel-mode",
    field: "Travel mode",
    status: parsed.travelModeDocumented ? "recovered" : "partial",
    detail: `${parsed.travelMode}. ${parsed.travelModeEvidence ?? ""}`.trim(),
  };
}

function avoidStatus(parsed: ParsedMapsUrl): FieldStatus {
  const values = [parsed.avoid.tolls, parsed.avoid.highways, parsed.avoid.ferries];
  if (!values.some((value) => value !== null)) {
    return "not_encoded";
  }
  return parsed.avoidDocumented ? "recovered" : "partial";
}

function avoidDetail(parsed: ParsedMapsUrl): string {
  const parts: string[] = [];
  if (parsed.avoid.tolls !== null) {
    parts.push(`tolls=${parsed.avoid.tolls}`);
  }
  if (parsed.avoid.highways !== null) {
    parts.push(`highways=${parsed.avoid.highways}`);
  }
  if (parsed.avoid.ferries !== null) {
    parts.push(`ferries=${parsed.avoid.ferries}`);
  }
  if (parts.length === 0) {
    return "The documented Maps URLs avoid parameter (tolls, highways, ferries) is absent. Fields inside the address-bar data blob were not read as avoidance preferences.";
  }
  if (parsed.avoidDocumented) {
    return `${parts.join(", ")}. Source: the avoid query parameter documented by Google Maps URLs.`;
  }
  return `${parts.join(", ")}. Source: legacy dirflg. That flag is outside the current Maps URLs parameter list.`;
}

function departureStatus(parsed: ParsedMapsUrl): FieldStatus {
  if (parsed.departureTime) {
    return "partial";
  }
  return parsed.uninterpretedBlobFields.some((field) => field.startsWith("!8j"))
    ? "inconclusive"
    : "not_encoded";
}

function departureDetail(parsed: ParsedMapsUrl): string {
  const longField = parsed.uninterpretedBlobFields.find((field) => field.startsWith("!8j"));
  if (parsed.departureTime) {
    return `departure_time=${parsed.departureTime}. Maps URLs does not document this parameter.`;
  }
  if (!longField) {
    return "No documented departure time is present, so traffic at the moment of sharing cannot be restored from the URL.";
  }
  const digits = longField.slice(3);
  const seconds = Number(digits);
  const asUtc =
    Number.isFinite(seconds) && seconds > 1_000_000_000 && seconds < 10_000_000_000
      ? ` If the integer were Unix seconds, it would be ${new Date(seconds * 1000).toISOString()}.`
      : "";
  return `The data blob contains ${longField}.${asUtc} Maps URLs does not document this field, so it was not treated as a recovered departure time.`;
}

function alternativeStatus(parsed: ParsedMapsUrl): FieldStatus {
  if (parsed.undocumentedIntegers.length > 0 || parsed.uninterpretedBlobFields.length > 0) {
    return "inconclusive";
  }
  return "not_encoded";
}

function alternativeDetail(parsed: ParsedMapsUrl): string {
  if (parsed.undocumentedIntegers.length === 0 && parsed.uninterpretedBlobFields.length === 0) {
    return "Nothing in the URL identifies which alternative was on screen when the link was shared.";
  }
  const parts = [
    parsed.undocumentedIntegers.length > 0
      ? `integers ${parsed.undocumentedIntegers.join(", ")}`
      : "",
    parsed.uninterpretedBlobFields.length > 0
      ? `uninterpreted fields ${parsed.uninterpretedBlobFields.join(", ")}`
      : "",
  ].filter(Boolean);
  return `The data blob contained ${parts.join("; ")}. Google Maps URLs does not document them as the selected alternative or as road geometry, so they were not used to choose a route.`;
}

function summarize(
  parsed: ParsedMapsUrl,
  origin: RouteStop | undefined,
  destination: RouteStop | undefined,
  intermediates: RouteStop[],
  canReconstructStops: boolean,
): string {
  if (parsed.kind === "short_link") {
    return "This is a short link. The stops stay hidden until Google redirects it to a full maps URL. Offline parsing cannot recover them.";
  }
  if (parsed.kind === "invalid") {
    return parsed.warnings[0] ?? "The text could not be parsed as a Google Maps URL.";
  }
  if (parsed.kind === "unsupported") {
    return "The link opens Google Maps, but it is not a directions URL, so there is no route to import.";
  }
  if (!origin || !destination) {
    return "The link looks like directions, but an endpoint is missing. The selected route cannot be discussed until both ends are known.";
  }

  const mode = parsed.travelMode
    ? `Travel mode is ${parsed.travelMode}${parsed.travelModeDocumented ? "" : " (interpreted from an undocumented data-blob enum)"}.`
    : "Travel mode was not in the URL.";
  const middle =
    intermediates.length === 0
      ? "There are no intermediate stops."
      : `${intermediates.length} intermediate stop${intermediates.length === 1 ? "" : "s"} ${intermediates.length === 1 ? "was" : "were"} recovered.`;
  const geometry = parsed.encodedPolyline
    ? "An encoded polyline was present on the URL."
    : "The selected alternative, its polyline, and any route token were not in the URL.";

  const reconstruct = canReconstructStops
    ? "A new route can be computed from the recovered stops. That computation is not the route the person selected."
    : "The stops are not complete enough to reconstruct.";

  return `${stopTitle(origin)} to ${stopTitle(destination)}. ${middle} ${mode} ${geometry} ${reconstruct}`;
}
