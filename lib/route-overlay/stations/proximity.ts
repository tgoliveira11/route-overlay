import { haversineMeters, pathLengthMeters } from "@/lib/route-overlay/geo";
import type { GeoPoint } from "@/lib/route-overlay/types";

const METERS_PER_DEGREE = 111_320;
export const LONG_SEGMENT_METERS = 2_000;
export const PRIMARY_CORRIDOR_METERS = 2_000;
export const EXTENDED_CORRIDOR_METERS = 5_000;

export interface RouteProjection {
  distanceMeters: number;
  progressMeters: number;
  segmentIndex: number;
  segmentLengthMeters: number;
  longSegment: boolean;
}

export interface RouteClip {
  points: GeoPoint[];
  clipIndex: number;
  approachMeters: number;
  reliable: boolean;
}

export function clipAtNearest(points: GeoPoint[], border: GeoPoint, reliableWithinMeters = 5_000): RouteClip {
  if (points.length === 0) {
    return { points: [], clipIndex: -1, approachMeters: Number.POSITIVE_INFINITY, reliable: false };
  }
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  points.forEach((point, index) => {
    const distance = haversineMeters(point, border);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return {
    points: points.slice(0, bestIndex + 1),
    clipIndex: bestIndex,
    approachMeters: bestDistance,
    reliable: bestDistance <= reliableWithinMeters,
  };
}

export function longSegments(points: GeoPoint[], limitMeters = LONG_SEGMENT_METERS): number {
  let count = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (haversineMeters(points[index - 1], points[index]) > limitMeters) {
      count += 1;
    }
  }
  return count;
}

/**
 * Straight-line distance to the polyline. This is a screening distance,
 * not a driving detour and not evidence that the station has highway access.
 */
export function projectOntoPolyline(point: GeoPoint, vertices: GeoPoint[]): RouteProjection | null {
  if (vertices.length === 0) {
    return null;
  }
  if (vertices.length === 1) {
    return {
      distanceMeters: haversineMeters(point, vertices[0]),
      progressMeters: 0,
      segmentIndex: 0,
      segmentLengthMeters: 0,
      longSegment: false,
    };
  }

  let best = {
    distanceMeters: Number.POSITIVE_INFINITY,
    progressMeters: 0,
    segmentIndex: 0,
    segmentLengthMeters: 0,
  };
  let traveled = 0;
  for (let index = 1; index < vertices.length; index += 1) {
    const start = vertices[index - 1];
    const end = vertices[index];
    const segmentLength = haversineMeters(start, end);
    const projection = projectSegment(point, start, end);
    if (projection.distanceMeters < best.distanceMeters) {
      best = {
        distanceMeters: projection.distanceMeters,
        progressMeters: traveled + segmentLength * projection.t,
        segmentIndex: index - 1,
        segmentLengthMeters: segmentLength,
      };
    }
    traveled += segmentLength;
  }
  return {
    ...best,
    longSegment: best.segmentLengthMeters > LONG_SEGMENT_METERS,
  };
}

export function corridorBand(distanceMeters: number | null): "0_2_km" | "2_5_km" | "outside" | "ungeolocated" {
  if (distanceMeters === null) {
    return "ungeolocated";
  }
  if (distanceMeters <= PRIMARY_CORRIDOR_METERS) {
    return "0_2_km";
  }
  if (distanceMeters <= EXTENDED_CORRIDOR_METERS) {
    return "2_5_km";
  }
  return "outside";
}

export function routeLength(points: GeoPoint[]): number {
  return pathLengthMeters(points);
}

function projectSegment(
  point: GeoPoint,
  start: GeoPoint,
  end: GeoPoint,
): { distanceMeters: number; t: number } {
  const originLatitude = (start.latitude * Math.PI) / 180;
  const scaleX = METERS_PER_DEGREE * Math.cos(originLatitude);
  const bx = (end.longitude - start.longitude) * scaleX;
  const by = (end.latitude - start.latitude) * METERS_PER_DEGREE;
  const px = (point.longitude - start.longitude) * scaleX;
  const py = (point.latitude - start.latitude) * METERS_PER_DEGREE;
  const lengthSquared = bx * bx + by * by;
  const t = lengthSquared === 0 ? 0 : clamp((px * bx + py * by) / lengthSquared, 0, 1);
  const projected = {
    latitude: start.latitude + (end.latitude - start.latitude) * t,
    longitude: start.longitude + (end.longitude - start.longitude) * t,
  };
  return { distanceMeters: haversineMeters(point, projected), t };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
