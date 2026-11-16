import { diagnoseFidelity } from "@/lib/route-overlay/fidelity";
import {
  fabricateCorridor,
  formatCoordinate,
  pathLengthMeters,
} from "@/lib/route-overlay/geo";
import { encodePolyline } from "@/lib/route-overlay/polyline";
import { findSample } from "@/lib/route-overlay/samples";
import type {
  GeoPoint,
  GoogleApiStatus,
  MapStop,
  ParsedMapsUrl,
  ReconstructionResult,
  ReconstructedRoute,
  TravelMode,
} from "@/lib/route-overlay/types";

/** Urban speeds used only to label synthetic durations. They are not Google estimates. */
const METERS_PER_SECOND: Record<TravelMode, number> = {
  driving: 32_000 / 3600,
  walking: 4_800 / 3600,
  bicycling: 15_000 / 3600,
  transit: 22_000 / 3600,
  two_wheeler: 28_000 / 3600,
  unknown: 32_000 / 3600,
};

const ROAD_FACTOR = 1.25;

export function reconstructMock(
  parsed: ParsedMapsUrl,
  status?: GoogleApiStatus,
): ReconstructionResult {
  const sample = findSample(parsed.inputUrl);
  const urlCoordinates = parsed.stops.every((stop) => stop.location)
    ? parsed.stops.map((stop) => stop.location as GeoPoint)
    : null;

  let points: GeoPoint[] | null = null;
  let mapStops: MapStop[] = [];
  let provenance: ReconstructionResult["geometryProvenance"] = "none";
  let provenanceNote: string | null = null;

  if (urlCoordinates && urlCoordinates.length >= 2) {
    points = urlCoordinates;
    provenance = "synthetic_from_url_coordinates";
    provenanceNote =
      "The line is a synthetic corridor bent through the coordinates that were in the URL. It is not a road geometry and it was not returned by Google.";
    mapStops = parsed.stops.map((stop) => ({
      label: stop.label ?? formatCoordinate(stop.location as GeoPoint),
      role: stop.role,
      location: stop.location as GeoPoint,
    }));
  } else if (sample?.fixture && sample.fixture.length >= 2) {
    points = sample.fixture.map((stop) => stop.location);
    provenance = "synthetic_from_local_sample_fixture";
    provenanceNote = sample.fixtureNote;
    mapStops = sample.fixture.map((stop, index) => ({
      label: stop.label,
      role: parsed.stops[index]?.role ?? "waypoint",
      location: stop.location,
    }));
  }

  const routes = points
    ? [buildAlternative(parsed, points, "A", 700), buildAlternative(parsed, points, "B", -1400)]
    : [schematicAlternative(parsed)];

  const fidelity = diagnoseFidelity(parsed, routes, "mock");

  return {
    source: "mock",
    mock: true,
    label: "MOCK — not a Google API response",
    disclaimer:
      "Mock reconstruction ran entirely on this machine. Google Routes was not called. Distances and durations are synthetic. The originally selected route was not restored.",
    geometryProvenance: provenance,
    provenanceNote,
    routes,
    sourcePolyline: parsed.encodedPolyline
      ? {
          encodedPolyline: parsed.encodedPolyline,
          note: "This polyline was taken from the URL itself. It is not part of the mock alternatives.",
        }
      : null,
    mapStops,
    fidelity,
    googleApi: {
      attempted: false,
      enabled: status?.enabled ?? false,
      configured: status?.configured ?? false,
      error: null,
    },
  };
}

function buildAlternative(
  parsed: ParsedMapsUrl,
  stops: GeoPoint[],
  letter: "A" | "B",
  offsetMeters: number,
): ReconstructedRoute {
  const corridor = fabricateCorridor(stops, offsetMeters);
  const distance = Math.round(pathLengthMeters(corridor) * ROAD_FACTOR);
  const speed = METERS_PER_SECOND[parsed.travelMode ?? "unknown"];
  return {
    id: `mock-${letter.toLowerCase()}`,
    label:
      letter === "A"
        ? "Mock alternative A — synthetic corridor"
        : "Mock alternative B — synthetic detour",
    source: "mock",
    synthetic: true,
    encodedPolyline: encodePolyline(corridor),
    distanceMeters: distance,
    durationSeconds: Math.round(distance / speed),
    description:
      letter === "A"
        ? "Fabricated by offsetting the midpoint of each recovered segment. Not a drivable road."
        : "A second fabricated bend in the opposite direction, so two alternatives exist. The URL did not say which one to keep.",
    isDefaultAlternative: letter === "A",
  };
}

function schematicAlternative(parsed: ParsedMapsUrl): ReconstructedRoute {
  const names = parsed.stops.map((stop) => stop.label ?? "unnamed").join(" → ");
  return {
    id: "mock-schematic",
    label: "Mock schematic — no geometry",
    source: "mock",
    synthetic: true,
    encodedPolyline: null,
    distanceMeters: null,
    durationSeconds: null,
    description: names
      ? `Stops were recovered as text (${names}). No coordinates were in the URL and no local fixture applies, so no polyline was invented.`
      : "No stops were available, so mock reconstruction produced no geometry.",
    isDefaultAlternative: true,
  };
}
