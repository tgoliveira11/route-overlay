import { haversineMeters } from "@/lib/route-overlay/geo";
import { fold } from "@/lib/route-overlay/stations/text";
import type { GeoPoint } from "@/lib/route-overlay/types";

export interface MunicipalSeat {
  ibgeCode: string;
  name: string;
  stateCode: string;
  location: GeoPoint;
}

export interface CorridorMunicipality {
  ibgeCode: string;
  name: string;
  anpName: string;
  stateCode: string;
  uf: string;
  seatDistanceMeters: number;
  reason: "nearest_seat" | "seat_within_buffer";
}

const UF_BY_IBGE: Record<string, string> = {
  "35": "SP",
  "41": "PR",
  "42": "SC",
  "43": "RS",
};

/**
 * Municipal seats choose which ANP municipality queries to run.
 * A seat is not a station location and is not a municipal boundary.
 */
export function selectCorridorMunicipalities(
  route: GeoPoint[],
  seats: MunicipalSeat[],
  bufferMeters = 20_000,
  sampleMeters = 5_000,
): CorridorMunicipality[] {
  const southern = seats.filter((seat) => UF_BY_IBGE[seat.stateCode]);
  const selected = new Map<string, CorridorMunicipality>();
  const samples = sampleRoute(route, sampleMeters);
  for (const point of samples) {
    const nearest = nearestSeat(point, southern);
    if (!nearest) {
      continue;
    }
    remember(selected, nearest.seat, nearest.distance, "nearest_seat");
  }
  for (const seat of southern) {
    const distance = distanceToRoute(seat.location, route);
    if (distance <= bufferMeters) {
      remember(selected, seat, distance, "seat_within_buffer");
    }
  }
  return [...selected.values()].sort((left, right) => left.uf.localeCompare(right.uf) || left.anpName.localeCompare(right.anpName));
}

function remember(
  selected: Map<string, CorridorMunicipality>,
  seat: MunicipalSeat,
  distance: number,
  reason: CorridorMunicipality["reason"],
): void {
  const current = selected.get(seat.ibgeCode);
  if (current && current.seatDistanceMeters <= distance) {
    return;
  }
  selected.set(seat.ibgeCode, {
    ibgeCode: seat.ibgeCode,
    name: seat.name,
    anpName: fold(seat.name),
    stateCode: seat.stateCode,
    uf: UF_BY_IBGE[seat.stateCode],
    seatDistanceMeters: distance,
    reason: current?.reason === "nearest_seat" ? "nearest_seat" : reason,
  });
}

function sampleRoute(route: GeoPoint[], sampleMeters: number): GeoPoint[] {
  if (route.length === 0) {
    return [];
  }
  const samples = [route[0]];
  let since = 0;
  for (let index = 1; index < route.length; index += 1) {
    since += haversineMeters(route[index - 1], route[index]);
    if (since >= sampleMeters) {
      samples.push(route[index]);
      since = 0;
    }
  }
  samples.push(route[route.length - 1]);
  return samples;
}

function nearestSeat(point: GeoPoint, seats: MunicipalSeat[]): { seat: MunicipalSeat; distance: number } | null {
  let best: { seat: MunicipalSeat; distance: number } | null = null;
  for (const seat of seats) {
    const distance = haversineMeters(point, seat.location);
    if (!best || distance < best.distance) {
      best = { seat, distance };
    }
  }
  return best;
}

function distanceToRoute(point: GeoPoint, route: GeoPoint[]): number {
  let best = Number.POSITIVE_INFINITY;
  const step = Math.max(1, Math.floor(route.length / 2_000));
  for (let index = 0; index < route.length; index += step) {
    best = Math.min(best, haversineMeters(point, route[index]));
  }
  return best;
}
