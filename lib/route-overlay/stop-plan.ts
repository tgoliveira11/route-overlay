import { SYNTHETIC_STATIONS, type FuelType, type SyntheticStation } from "@/lib/route-overlay/fuel-stations";
import { haversineMeters, pathLengthMeters } from "@/lib/route-overlay/geo";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import type { GeoPoint } from "@/lib/route-overlay/types";

export interface StopPlanRequest {
  fuel: FuelType;
  rangeKm: number;
  reserveKm: number;
  maxDetourKm: number;
  intervalKm: number;
  prefer24h: boolean;
}

export interface PlannedStop {
  station: SyntheticStation;
  alongKm: number;
  detourKm: number;
  /** Haversine distance from the route sample to the fixture. Not a road detour. */
  detourMethod: "straight_line";
  synthetic: true;
}

export interface StopPlan {
  stops: PlannedStop[];
  gaps: string[];
  usableRangeKm: number;
  routeKm: number;
  feasible: boolean;
  detourMethod: "straight_line";
  disclaimer: string;
}

export function planStopsAlongPolyline(
  encodedPolyline: string,
  request: StopPlanRequest,
  stations: SyntheticStation[] = SYNTHETIC_STATIONS,
): StopPlan {
  const points = decodePolyline(encodedPolyline);
  return planStopsAlongPoints(points, request, stations);
}

export function planStopsAlongPoints(
  points: GeoPoint[],
  request: StopPlanRequest,
  stations: SyntheticStation[] = SYNTHETIC_STATIONS,
): StopPlan {
  const disclaimer =
    "Synthetic station fixtures only. These are not real businesses, and this plan does not list every station along the road. Detours are straight-line estimates, not road distances. This plan does not claim real-world refueling safety.";
  const routeKm = pathLengthMeters(points) / 1000;
  const usableRangeKm = request.rangeKm - request.reserveKm;
  if (points.length < 2 || !(usableRangeKm > 0) || !(request.intervalKm > 0) || !(request.maxDetourKm >= 0)) {
    return {
      stops: [],
      gaps: ["The confirmed geometry or the vehicle limits cannot support a stop plan."],
      usableRangeKm,
      routeKm,
      feasible: false,
      detourMethod: "straight_line",
      disclaimer,
    };
  }

  const samples = samplePath(points, 20);
  const chosen: PlannedStop[] = [];
  const gaps: string[] = [];
  const used = new Set<string>();
  let lastFuelKm = 0;
  const spacing = Math.min(request.intervalKm, usableRangeKm);

  for (const sample of samples) {
    if (sample.alongKm <= 0) {
      continue;
    }
    const sinceFuelKm = sample.alongKm - lastFuelKm;
    const atEnd = sample.alongKm >= routeKm - 0.05;
    if (sinceFuelKm < spacing && !atEnd) {
      continue;
    }
    if (atEnd && sinceFuelKm <= usableRangeKm && sinceFuelKm < spacing) {
      continue;
    }
    const match = nearestStation(sample.point, stations, request, used);
    if (match && sinceFuelKm <= usableRangeKm) {
      chosen.push({
        station: match.station,
        alongKm: round1(sample.alongKm),
        detourKm: round1(match.detourKm),
        detourMethod: "straight_line",
        synthetic: true,
      });
      used.add(match.station.id);
      lastFuelKm = sample.alongKm;
      continue;
    }
    if (sinceFuelKm > usableRangeKm) {
      gaps.push(
        `No unused synthetic station within a straight-line detour of ${request.maxDetourKm} km before the usable range was exceeded at ${sample.alongKm.toFixed(0)} km.`,
      );
      break;
    }
    gaps.push(
      `No unused synthetic ${request.fuel} station within a straight-line detour of ${request.maxDetourKm} km at ${sample.alongKm.toFixed(0)} km. The usable range was not restored.`,
    );
  }

  if (routeKm - lastFuelKm > usableRangeKm) {
    gaps.push(
      `The remaining ${round1(routeKm - lastFuelKm)} km after the last fuel point exceeds the usable range of ${round1(usableRangeKm)} km.`,
    );
  }

  return {
    stops: chosen,
    gaps,
    usableRangeKm,
    routeKm: round1(routeKm),
    feasible: gaps.length === 0,
    detourMethod: "straight_line",
    disclaimer,
  };
}

function nearestStation(
  point: GeoPoint,
  stations: SyntheticStation[],
  request: StopPlanRequest,
  used: Set<string>,
): { station: SyntheticStation; detourKm: number } | null {
  const eligible = stations.filter((station) => {
    if (used.has(station.id)) {
      return false;
    }
    if (!station.fuels.includes(request.fuel)) {
      return false;
    }
    if (request.prefer24h && !station.open24h) {
      return false;
    }
    return true;
  });
  let best: { station: SyntheticStation; detourKm: number } | null = null;
  for (const station of eligible) {
    const detourKm = haversineMeters(point, station.location) / 1000;
    if (detourKm > request.maxDetourKm) {
      continue;
    }
    if (!best || detourKm < best.detourKm) {
      best = { station, detourKm };
    }
  }
  return best;
}

function samplePath(points: GeoPoint[], stepKm: number): Array<{ point: GeoPoint; alongKm: number }> {
  const samples: Array<{ point: GeoPoint; alongKm: number }> = [];
  let along = 0;
  let nextMark = stepKm;
  samples.push({ point: points[0], alongKm: 0 });
  for (let index = 1; index < points.length; index += 1) {
    const segmentKm = haversineMeters(points[index - 1], points[index]) / 1000;
    along += segmentKm;
    if (along >= nextMark) {
      samples.push({ point: points[index], alongKm: along });
      nextMark = along + stepKm;
    }
  }
  const endKm = pathLengthMeters(points) / 1000;
  if (samples[samples.length - 1].alongKm < endKm) {
    samples.push({ point: points[points.length - 1], alongKm: endKm });
  }
  return samples;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
