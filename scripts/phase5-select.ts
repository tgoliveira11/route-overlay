import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import { selectCorridorMunicipalities, type MunicipalSeat } from "@/lib/route-overlay/stations/corridor";
import { clipAtNearest, longSegments, routeLength } from "@/lib/route-overlay/stations/proximity";

const root = process.cwd();
const summary = JSON.parse(readFileSync(path.join(root, ".route-overlay", "phase4-live-summary.json"), "utf8")) as {
  scenarios: Array<{ id: string; routes: Array<{ id: string; description: string; distanceMeters: number; durationSeconds: number; encodedPolyline: string }> }>;
};
const scenario = summary.scenarios.find((item) => item.id === "A");
const route = scenario?.routes.find((item) => item.id === "google-1");
if (!route?.encodedPolyline) {
  throw new Error("Cached scenario A google-1 polyline is missing.");
}

const decoded = decodePolyline(route.encodedPolyline);
const clip = clipAtNearest(decoded, { latitude: -32.56, longitude: -53.37 });
const seats = readFileSync(path.join(root, ".route-overlay", "anp", "municipios-brasileiros.csv"), "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map(parseSeat)
  .filter((seat): seat is MunicipalSeat => seat !== null);
const municipalities = selectCorridorMunicipalities(clip.points, seats);

const output = {
  route: {
    label: "cached_google_default_route",
    scenarioId: "A",
    candidateId: "google-1",
    description: route.description,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    pointCount: decoded.length,
    brazilianPointCount: clip.points.length,
    brazilianLengthMeters: Math.round(routeLength(clip.points)),
    borderApproachMeters: Math.round(clip.approachMeters),
    borderClipReliable: clip.reliable,
    longSegmentCount: longSegments(clip.points),
    confirmedGeometryAvailable: false,
    fidelity: "UNVERIFIED",
  },
  municipalities,
};

const directory = path.join(root, ".route-overlay", "anp");
mkdirSync(directory, { recursive: true });
writeFileSync(path.join(directory, "corridor-municipalities.json"), `${JSON.stringify(output, null, 2)}\n`);
writeFileSync(path.join(directory, "route-points.json"), `${JSON.stringify(clip.points)}\n`);
console.log(JSON.stringify({
  municipalities: municipalities.length,
  brazilianKm: Math.round(routeLength(clip.points) / 1000),
  approachMeters: Math.round(clip.approachMeters),
  reliable: clip.reliable,
  longSegments: longSegments(clip.points),
  byUf: municipalities.reduce<Record<string, number>>((counts, item) => {
    counts[item.uf] = (counts[item.uf] ?? 0) + 1;
    return counts;
  }, {}),
}));

function parseSeat(line: string): MunicipalSeat | null {
  const cells = line.split(",");
  if (cells.length < 6) {
    return null;
  }
  const latitude = Number(cells[2]);
  const longitude = Number(cells[3]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return {
    ibgeCode: cells[0],
    name: cells[1],
    stateCode: cells[5],
    location: { latitude, longitude },
  };
}
