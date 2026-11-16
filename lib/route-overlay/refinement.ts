import type { AvoidFlags, GeoPoint, ParsedMapsUrl, RouteStop, TravelMode } from "@/lib/route-overlay/types";

export interface DraftWaypoint {
  id: string;
  label: string;
  location: GeoPoint | null;
  placeId: string | null;
  via: boolean;
}

export interface ConstraintReport {
  represented: string[];
  unsupported: string[];
}

export function createDraftWaypoint(
  input: string,
  id: string,
): DraftWaypoint | { error: string } {
  const text = input.trim();
  if (!text) {
    return { error: "Enter a place name or a latitude, longitude pair." };
  }
  if (!id.trim()) {
    return { error: "A waypoint id is required." };
  }
  let via = false;
  let body = text;
  if (/^via:/i.test(body)) {
    via = true;
    body = body.slice(4).trim();
  }
  const placeId = /^place_id:/i.test(body) ? body.slice("place_id:".length).trim() : null;
  const location = placeId ? null : parseCoordinateText(body);
  return {
    id,
    label: location ? formatDraftLabel(location) : body,
    location,
    placeId: placeId || null,
    via,
  };
}

export function intermediateDrafts(parsed: ParsedMapsUrl): DraftWaypoint[] {
  return parsed.stops
    .filter((stop) => stop.role === "waypoint" || stop.role === "via")
    .map((stop, index) => ({
      id: `imported-${index}`,
      label: stop.label ?? (stop.location ? formatDraftLabel(stop.location) : stop.placeId ?? "Waypoint"),
      location: stop.location,
      placeId: stop.placeId,
      via: stop.via || stop.role === "via",
    }));
}

export function moveDraft(waypoints: DraftWaypoint[], id: string, direction: -1 | 1): DraftWaypoint[] {
  const index = waypoints.findIndex((waypoint) => waypoint.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= waypoints.length) {
    return waypoints;
  }
  const next = waypoints.slice();
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

export function removeDraft(waypoints: DraftWaypoint[], id: string): DraftWaypoint[] {
  return waypoints.filter((waypoint) => waypoint.id !== id);
}

/**
 * Build a directions URL from the imported endpoints plus the current draft.
 * The original imported URL is left unchanged by the caller.
 */
export function applyDraft(parsed: ParsedMapsUrl, waypoints: DraftWaypoint[]): ParsedMapsUrl {
  const origin = parsed.stops.find((stop) => stop.role === "origin");
  const destination = parsed.stops.find((stop) => stop.role === "destination");
  if (!origin || !destination) {
    return parsed;
  }
  const middle: RouteStop[] = waypoints.map((waypoint) => ({
    role: waypoint.via ? "via" : "waypoint",
    label: waypoint.label,
    placeId: waypoint.placeId,
    location: waypoint.location,
    via: waypoint.via,
    source: "query",
  }));
  const stops = [origin, ...middle, destination];
  const normalizedUrl = buildMapsDirectionsUrl(stops, parsed.travelMode, parsed.avoid);
  const constraints = describeRoutingConstraints({ ...parsed, stops });
  return {
    ...parsed,
    normalizedUrl,
    stops,
    encodedPolyline: null,
    polylineFromExtension: false,
    routeToken: null,
    warnings: [
      ...parsed.warnings,
      "Intermediate waypoints were edited locally. Recalculation uses this draft and keeps the original imported URL unchanged.",
      ...constraints.unsupported,
    ],
  };
}

export function buildMapsDirectionsUrl(
  stops: RouteStop[],
  travelMode: TravelMode | null,
  avoid: AvoidFlags,
): string {
  const origin = stops.find((stop) => stop.role === "origin");
  const destination = stops.find((stop) => stop.role === "destination");
  const waypoints = stops.filter((stop) => stop.role === "waypoint" || stop.role === "via");
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  if (origin) {
    url.searchParams.set("origin", stopQuery(origin));
    if (origin.placeId) {
      url.searchParams.set("origin_place_id", origin.placeId);
    }
  }
  if (destination) {
    url.searchParams.set("destination", stopQuery(destination));
    if (destination.placeId) {
      url.searchParams.set("destination_place_id", destination.placeId);
    }
  }
  if (waypoints.length > 0) {
    url.searchParams.set("waypoints", waypoints.map((stop) => stopQuery(stop)).join("|"));
    if (waypoints.some((stop) => stop.placeId)) {
      url.searchParams.set(
        "waypoint_place_ids",
        waypoints.map((stop) => stop.placeId ?? "").join("|"),
      );
    }
  }
  if (travelMode && travelMode !== "unknown") {
    url.searchParams.set("travelmode", travelMode === "two_wheeler" ? "two-wheeler" : travelMode);
  }
  const avoided = (["tolls", "highways", "ferries"] as const).filter((flag) => avoid[flag] === true);
  if (avoided.length > 0) {
    url.searchParams.set("avoid", avoided.join("|"));
  }
  return url.toString();
}

export function describeRoutingConstraints(parsed: ParsedMapsUrl): ConstraintReport {
  const represented: string[] = [];
  const unsupported: string[] = [];
  const active = (["tolls", "highways", "ferries"] as const).filter((flag) => parsed.avoid[flag] === true);
  const mode = parsed.travelMode;
  const modifiersSupported = mode === "driving" || mode === "two_wheeler" || mode === null || mode === "unknown";
  if (active.length > 0 && modifiersSupported) {
    represented.push(
      `Avoid ${active.join(", ")} is kept on the rebuilt URL and sent as Routes API routeModifiers.`,
    );
  }
  if (active.length > 0 && !modifiersSupported) {
    unsupported.push(
      `Avoid ${active.join(", ")} was recovered, but routeModifiers are not sent for ${mode}.`,
    );
  }
  const identified = parsed.stops.filter((stop) => stop.placeId);
  if (identified.length > 0) {
    represented.push(`Place IDs kept: ${identified.map((stop) => stop.placeId).join(", ")}.`);
  }
  const viaCount = parsed.stops.filter((stop) => stop.via).length;
  if (viaCount > 0) {
    represented.push(
      viaCount === 1
        ? "1 via waypoint keeps pass-through semantics."
        : `${viaCount} via waypoints keep pass-through semantics.`,
    );
  }
  if (parsed.departureTime) {
    unsupported.push("A departure time was present. This reconstruction does not send it.");
  }
  return { represented, unsupported };
}

function stopQuery(stop: RouteStop): string {
  const prefix = stop.via ? "via:" : "";
  if (stop.placeId && !stop.location) {
    return `${prefix}place_id:${stop.placeId}`;
  }
  if (stop.location) {
    return `${prefix}${stop.location.latitude},${stop.location.longitude}`;
  }
  return `${prefix}${stop.label ?? ""}`;
}

export function parseCoordinateText(text: string): GeoPoint | null {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(text);
  if (!match) {
    return null;
  }
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function formatDraftLabel(point: GeoPoint): string {
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}
