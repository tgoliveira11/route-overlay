import type { GeoPoint, RouteStop } from "@/lib/route-overlay/types";

const METERS_PER_DEGREE_LATITUDE = 111_320;

export function haversineMeters(from: GeoPoint, to: GeoPoint): number {
  const earthRadius = 6_371_000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function pathLengthMeters(points: GeoPoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += haversineMeters(points[index - 1], points[index]);
  }
  return total;
}

/**
 * Insert a point offset to the left of each segment so a synthetic corridor
 * is visibly not the straight line between the stops.
 */
export function fabricateCorridor(
  stops: GeoPoint[],
  offsetMeters: number,
): GeoPoint[] {
  if (stops.length === 0) {
    return [];
  }
  if (stops.length === 1) {
    return [stops[0]];
  }

  const points: GeoPoint[] = [];
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index];
    const end = stops[index + 1];
    if (index === 0) {
      points.push(start);
    }
    points.push(offsetMidpoint(start, end, offsetMeters));
    points.push(end);
  }
  return points;
}

export function offsetMidpoint(
  start: GeoPoint,
  end: GeoPoint,
  offsetMeters: number,
): GeoPoint {
  const latitude = (start.latitude + end.latitude) / 2;
  const longitude = (start.longitude + end.longitude) / 2;
  const latitudeRadians = toRadians(latitude);
  const east = (end.longitude - start.longitude) * Math.cos(latitudeRadians);
  const north = end.latitude - start.latitude;
  const length = Math.hypot(east, north) || 1;
  const perpendicularEast = -north / length;
  const perpendicularNorth = east / length;
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LATITUDE * Math.cos(latitudeRadians);

  return {
    latitude:
      latitude +
      (perpendicularNorth * offsetMeters) / METERS_PER_DEGREE_LATITUDE,
    longitude:
      longitude + (perpendicularEast * offsetMeters) / metersPerDegreeLongitude,
  };
}

export function stopTitle(stop: RouteStop): string {
  if (stop.label) {
    return stop.label;
  }
  if (stop.location) {
    return formatCoordinate(stop.location);
  }
  if (stop.placeId) {
    return stop.placeId;
  }
  return "Unnamed stop";
}

export function formatCoordinate(point: GeoPoint): string {
  return `${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}`;
}

export function formatDistance(meters: number | null): string {
  if (meters === null) {
    return "Not estimated";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) {
    return "Not estimated";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder === 0 ? `${hours} h` : `${hours} h ${remainder} min`;
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
