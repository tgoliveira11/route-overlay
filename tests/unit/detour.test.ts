import { describe, expect, it } from "vitest";
import { encodePolyline, decodePolyline } from "@/lib/route-overlay/polyline";
import {
  classifyFidelity,
  detourDelta,
  detourRequest,
  pointAtProgress,
  selectAnchors,
  selectDetourCandidates,
} from "@/lib/route-overlay/stations/detour";
import type { StationObservation } from "@/lib/route-overlay/stations/types";

const line = [
  { latitude: -23.95, longitude: -46.33 },
  { latitude: -27.0, longitude: -49.0 },
  { latitude: -30.0, longitude: -51.2 },
  { latitude: -32.56, longitude: -53.37 },
];

describe("road detour geometry", () => {
  it("places anchors on the confirmed corridor and rejects a station too close to either end", () => {
    const progress = pointAtProgress(line, 80_000);
    expect(progress).not.toBeNull();
    const anchors = selectAnchors(line, progress!.progressMeters, 8_000);
    expect(anchors?.separationMeters).toBe(16_000);
    expect(selectAnchors(line, 1_000, 8_000)).toBeNull();
  });

  it("does not clamp a negative driving delta to zero", () => {
    expect(detourDelta(
      { distanceMeters: 16_000, durationSeconds: 700 },
      { distanceMeters: 15_400, durationSeconds: 680 },
    )).toEqual({ extraDistanceMeters: -600, extraDrivingSeconds: -20 });
  });

  it("rejects a direct route that leaves the confirmed corridor", () => {
    const changed = classifyFidelity([6_000, 7_000, 8_000]);
    expect(changed.fidelity).toBe("route_changed");
    const local = classifyFidelity([40, 80, 120, 200]);
    expect(local.fidelity).toBe("valid_local");
    expect(classifyFidelity([])).toEqual({ fidelity: "provider_failure", medianMeters: null, p95Meters: null });
  });

  it("builds a stopover request without pass-through or waypoint optimization", () => {
    const anchors = selectAnchors(line, 200_000, 8_000);
    const request = detourRequest(anchors!.upstream, anchors!.downstream, { latitude: -28, longitude: -50 });
    expect(request.travelMode).toBe("driving");
    expect(request.stops.map((stop) => stop.role)).toEqual(["origin", "waypoint", "destination"]);
    expect(request.stops.every((stop) => stop.via === false)).toBe(true);
    expect(request.encodedPolyline).toBeNull();
    const direct = detourRequest(anchors!.upstream, anchors!.downstream, null);
    expect(direct.stops).toHaveLength(2);
  });

  it("keeps candidate order by route progress and skips invalid coordinates", () => {
    const stations = [0, 1, 2].map((index) => station(index));
    stations.push({ ...station(3), location: null, locationQuality: "MISSING" });
    const chosen = selectDetourCandidates(stations, line, 10);
    expect(chosen.every((item) => item.location !== null)).toBe(true);
    const progress = chosen.map((item) => item.progressMeters);
    expect([...progress].sort((left, right) => left - right)).toEqual(progress);
    expect(decodePolyline(encodePolyline(line))).toHaveLength(line.length);
  });
});

function station(index: number): StationObservation {
  return {
    cnpj: `0000000000000${index}`,
    codigoSimp: String(index),
    razaoSocial: `Station ${index}`,
    endereco: "",
    municipio: "Test",
    uf: index === 0 ? "SP" : "RS",
    bandeira: index % 2 === 0 ? "VIBRA" : "IPIRANGA",
    products: [],
    premium: true,
    podiumText: false,
    location: { latitude: -24 - index, longitude: -47 - index * 0.4 },
    locationQuality: "MEDIUM",
    coordinateSource: "anp_api",
    validationText: "",
    obtainedOn: "",
    informationOrigin: "",
    sigafStatus: "",
    distanceToRouteMeters: null,
    progressMeters: null,
    band: "outside",
    longSegment: false,
    duplicateCnpj: false,
    duplicateLocation: false,
    identityConfidence: "MEDIUM",
    premiumConfidence: "MEDIUM",
    freshness: "UNKNOWN",
  };
}
