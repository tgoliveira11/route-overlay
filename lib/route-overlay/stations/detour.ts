import { haversineMeters } from "@/lib/route-overlay/geo";
import { projectOntoPolyline, routeLength } from "@/lib/route-overlay/stations/proximity";
import type { StationObservation } from "@/lib/route-overlay/stations/types";
import type { GeoPoint, ParsedMapsUrl, RouteStop } from "@/lib/route-overlay/types";

export const DETOUR_ANCHOR_OFFSET_METERS = 8_000;

export type DetourFidelity = "valid_local" | "ambiguous_access" | "route_changed" | "provider_failure";

export interface RouteAnchors {
  upstream: GeoPoint;
  downstream: GeoPoint;
  upstreamProgressMeters: number;
  downstreamProgressMeters: number;
  separationMeters: number;
}

export interface DetourCandidate {
  cnpj: string;
  razaoSocial: string;
  municipio: string;
  uf: string;
  bandeira: string;
  locationQuality: StationObservation["locationQuality"];
  band: StationObservation["band"];
  progressMeters: number;
  distanceToRouteMeters: number;
  location: GeoPoint;
}

export function pointAtProgress(points: GeoPoint[], targetMeters: number): { point: GeoPoint; progressMeters: number } | null {
  if (points.length === 0) {
    return null;
  }
  if (targetMeters <= 0) {
    return { point: points[0], progressMeters: 0 };
  }
  let traveled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const step = haversineMeters(points[index - 1], points[index]);
    if (traveled + step >= targetMeters) {
      const remaining = targetMeters - traveled;
      const fraction = step === 0 ? 0 : remaining / step;
      return {
        point: {
          latitude: points[index - 1].latitude + (points[index].latitude - points[index - 1].latitude) * fraction,
          longitude: points[index - 1].longitude + (points[index].longitude - points[index - 1].longitude) * fraction,
        },
        progressMeters: targetMeters,
      };
    }
    traveled += step;
  }
  return { point: points[points.length - 1], progressMeters: traveled };
}

export function selectAnchors(
  points: GeoPoint[],
  progressMeters: number,
  offsetMeters = DETOUR_ANCHOR_OFFSET_METERS,
): RouteAnchors | null {
  const length = routeLength(points);
  const upstream = pointAtProgress(points, progressMeters - offsetMeters);
  const downstream = pointAtProgress(points, progressMeters + offsetMeters);
  if (!upstream || !downstream) {
    return null;
  }
  const separation = downstream.progressMeters - upstream.progressMeters;
  if (separation < offsetMeters || upstream.progressMeters <= 0 || downstream.progressMeters >= length) {
    return null;
  }
  return {
    upstream: upstream.point,
    downstream: downstream.point,
    upstreamProgressMeters: upstream.progressMeters,
    downstreamProgressMeters: downstream.progressMeters,
    separationMeters: separation,
  };
}

export function sampleOffsets(candidate: GeoPoint[], reference: GeoPoint[]): number[] {
  if (candidate.length === 0 || reference.length < 2) {
    return [];
  }
  const step = Math.max(1, Math.floor(candidate.length / 20));
  const distances: number[] = [];
  for (let index = 0; index < candidate.length; index += step) {
    const projection = projectOntoPolyline(candidate[index], reference);
    if (projection) {
      distances.push(projection.distanceMeters);
    }
  }
  return distances;
}

export function classifyFidelity(distances: number[]): { fidelity: DetourFidelity; medianMeters: number | null; p95Meters: number | null } {
  if (distances.length < 2) {
    return { fidelity: "provider_failure", medianMeters: null, p95Meters: null };
  }
  const sorted = [...distances].sort((left, right) => left - right);
  const medianMeters = sorted[Math.floor(sorted.length / 2)];
  const p95Meters = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  if (medianMeters > 2_000) {
    return { fidelity: "route_changed", medianMeters, p95Meters };
  }
  if (medianMeters <= 750 && p95Meters <= 2_000) {
    return { fidelity: "valid_local", medianMeters, p95Meters };
  }
  return { fidelity: "ambiguous_access", medianMeters, p95Meters };
}

export function detourDelta(direct: { distanceMeters: number; durationSeconds: number }, via: { distanceMeters: number; durationSeconds: number }): {
  extraDistanceMeters: number;
  extraDrivingSeconds: number;
} {
  return {
    extraDistanceMeters: via.distanceMeters - direct.distanceMeters,
    extraDrivingSeconds: via.durationSeconds - direct.durationSeconds,
  };
}

export function detourRequest(upstream: GeoPoint, downstream: GeoPoint, stopover: GeoPoint | null): ParsedMapsUrl {
  const stops: RouteStop[] = [
    coordinateStop("origin", "Upstream anchor", upstream),
    ...(stopover ? [coordinateStop("waypoint", "Premium station", stopover)] : []),
    coordinateStop("destination", "Downstream anchor", downstream),
  ];
  return {
    inputUrl: "route-overlay://detour",
    normalizedUrl: "route-overlay://detour",
    kind: "directions_path",
    shortLink: false,
    expandedFrom: null,
    travelMode: "driving",
    travelModeEvidence: "Detour experiment uses DRIVE.",
    travelModeDocumented: true,
    stops,
    viewport: null,
    encodedPolyline: null,
    polylineFromExtension: false,
    routeToken: null,
    departureTime: null,
    avoid: { tolls: null, highways: null, ferries: null },
    avoidDocumented: true,
    undocumentedIntegers: [],
    uninterpretedBlobFields: [],
    warnings: [],
  };
}

export function selectDetourCandidates(stations: StationObservation[], route: GeoPoint[], limit = 10): DetourCandidate[] {
  const eligible = stations.flatMap((station) => {
    if (!station.premium || !station.location || station.duplicateLocation || station.locationQuality === "LOW" || station.locationQuality === "MISSING") {
      return [];
    }
    const projection = projectOntoPolyline(station.location, route);
    if (!projection || projection.longSegment) {
      return [];
    }
    const band = projection.distanceMeters <= 2_000 ? "0_2_km" : projection.distanceMeters <= 5_000 ? "2_5_km" : "outside";
    if (band === "outside") {
      return [];
    }
    return [{
      cnpj: station.cnpj,
      razaoSocial: station.razaoSocial,
      municipio: station.municipio,
      uf: station.uf,
      bandeira: station.bandeira,
      locationQuality: station.locationQuality,
      band,
      progressMeters: projection.progressMeters,
      distanceToRouteMeters: projection.distanceMeters,
      location: station.location,
    } satisfies DetourCandidate];
  }).sort((left, right) => left.progressMeters - right.progressMeters);
  const chosen: DetourCandidate[] = [];
  const add = (station: DetourCandidate | undefined) => {
    if (!station || chosen.some((item) => item.cnpj === station.cnpj)) {
      return;
    }
    chosen.push(station);
  };
  for (const uf of ["SP", "PR", "SC", "RS"]) {
    add(eligible.find((station) => station.uf === uf));
  }
  add(eligible.find((station) => station.band === "2_5_km"));
  add(nearestBefore(eligible, 217_834));
  add(nearestAfter(eligible, 334_699));
  add(nearestBefore(eligible, 1_388_675));
  const brands = new Set(chosen.map((station) => station.bandeira));
  for (const station of eligible) {
    if (chosen.length >= limit) {
      break;
    }
    if (!brands.has(station.bandeira)) {
      add(station);
      brands.add(station.bandeira);
    }
  }
  const stride = Math.max(1, Math.floor(eligible.length / limit));
  for (let index = 0; chosen.length < limit && index < eligible.length; index += stride) {
    add(eligible[index]);
  }
  return chosen
    .sort((left, right) => left.progressMeters - right.progressMeters)
    .slice(0, limit);
}

function nearestBefore(stations: DetourCandidate[], progress: number): DetourCandidate | undefined {
  return [...stations].reverse().find((station) => station.progressMeters < progress);
}

function nearestAfter(stations: DetourCandidate[], progress: number): DetourCandidate | undefined {
  return stations.find((station) => station.progressMeters > progress);
}

function coordinateStop(role: RouteStop["role"], label: string, location: GeoPoint): RouteStop {
  return {
    role,
    label,
    placeId: null,
    location,
    via: false,
    source: "query",
  };
}
