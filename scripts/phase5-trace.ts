import { readFileSync } from "node:fs";
import { haversineMeters } from "@/lib/route-overlay/geo";
import { decodePolyline } from "@/lib/route-overlay/polyline";
import { clipAtNearest } from "@/lib/route-overlay/stations/proximity";

const summary = JSON.parse(readFileSync(".route-overlay/phase4-live-summary.json", "utf8")) as {
  scenarios: Array<{ id: string; routes: Array<{ id: string; encodedPolyline: string }> }>;
};
const route = summary.scenarios.find((item) => item.id === "A")?.routes.find((item) => item.id === "google-1");
if (!route) {
  throw new Error("missing route");
}
const clip = clipAtNearest(decodePolyline(route.encodedPolyline), { latitude: -32.56, longitude: -53.37 });
let traveled = 0;
let next = 0;
const rows: string[] = [];
for (let index = 1; index < clip.points.length; index += 1) {
  traveled += haversineMeters(clip.points[index - 1], clip.points[index]);
  if (traveled >= next) {
    const point = clip.points[index];
    rows.push(`${(traveled / 1000).toFixed(0)} km ${point.latitude.toFixed(3)}, ${point.longitude.toFixed(3)}`);
    next += 100_000;
  }
}
const end = clip.points[clip.points.length - 1];
console.log(rows.join("\n"));
console.log(`end ${end.latitude.toFixed(3)}, ${end.longitude.toFixed(3)}`);
