import { haversineMeters } from "@/lib/route-overlay/geo";
import { fold } from "@/lib/route-overlay/stations/text";
import type { MatchDecision } from "@/lib/route-overlay/stations/types";
import type { GeoPoint } from "@/lib/route-overlay/types";

export interface PlaceCandidate {
  id: string;
  name: string;
  formattedAddress: string;
  location: GeoPoint | null;
  businessStatus: string | null;
}

export interface StationIdentity {
  name: string;
  address: string;
  municipality: string;
  state: string;
  location: GeoPoint | null;
  brand: string;
}

export function matchPlaceCandidate(station: StationIdentity, candidate: PlaceCandidate | null): MatchDecision {
  if (!candidate) {
    return "MATCH_NOT_FOUND";
  }
  const municipality = municipalityMatches(station, candidate.formattedAddress);
  const distance = station.location && candidate.location
    ? haversineMeters(station.location, candidate.location)
    : null;
  const nameScore = tokenOverlap(station.name, candidate.name);
  const addressScore = tokenOverlap(station.address, candidate.formattedAddress);
  if (distance !== null && distance > 2_000 && !municipality) {
    return "MATCH_REJECTED";
  }
  if (distance !== null && distance <= 300 && (municipality || addressScore >= 0.5)) {
    return "MATCH_CONFIRMED";
  }
  if (distance !== null && distance <= 150 && nameScore >= 0.5 && municipality) {
    return "MATCH_CONFIRMED";
  }
  if (candidate.businessStatus === "CLOSED_PERMANENTLY") {
    return "MATCH_REJECTED";
  }
  return "MATCH_REVIEW_REQUIRED";
}

function municipalityMatches(station: StationIdentity, address: string): boolean {
  const folded = fold(address);
  return folded.includes(fold(station.municipality)) && folded.includes(fold(station.state));
}

function tokenOverlap(left: string, right: string): number {
  const stop = new Set(["POSTO", "AUTO", "LTDA", "COMERCIO", "COMERCIAL", "DE", "DA", "DO", "DOS", "E", "COMBUSTIVEIS"]);
  const leftTokens = new Set(fold(left).split(" ").filter((token) => token.length > 2 && !stop.has(token)));
  const rightTokens = new Set(fold(right).split(" ").filter((token) => token.length > 2 && !stop.has(token)));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      shared += 1;
    }
  }
  return shared / Math.min(leftTokens.size, rightTokens.size);
}
