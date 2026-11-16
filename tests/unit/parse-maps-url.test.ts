import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diagnoseFidelity } from "@/lib/route-overlay/fidelity";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import { assessRecoverability } from "@/lib/route-overlay/recoverability";
import { SAMPLES } from "@/lib/route-overlay/samples";
import { stopTitle } from "@/lib/route-overlay/geo";

describe("parseMapsUrl", () => {
  it("recovers the documented Maps URLs API sample", () => {
    const sample = sampleById("congonhas-masp");
    const parsed = parseMapsUrl(sample.url);
    expect(parsed.kind).toBe("maps_url_api");
    expect(stopTitle(parsed.stops[0])).toBe(sample.expected.origin);
    expect(parsed.stops[0].role).toBe("origin");
    expect(stopTitle(parsed.stops[1])).toBe(sample.expected.waypoints[0]);
    expect(parsed.stops[1].role).toBe("waypoint");
    expect(stopTitle(parsed.stops[2])).toBe(sample.expected.destination);
    expect(parsed.travelMode).toBe("driving");
    expect(parsed.travelModeDocumented).toBe(true);
    expect(parsed.stops.filter((stop) => stop.location)).toHaveLength(0);
    expect(parsed.encodedPolyline).toBeNull();
    expect(parsed.routeToken).toBeNull();
  });

  it("reads path names and data-blob coordinates in longitude, latitude order", () => {
    const sample = sampleById("vila-madalena-santos");
    const parsed = parseMapsUrl(sample.url);
    expect(parsed.kind).toBe("directions_path");
    expect(parsed.stops.map((stop) => stop.label)).toEqual([
      "Vila Madalena, São Paulo",
      "Santos, SP",
    ]);
    expect(parsed.stops[0].location).toEqual({
      latitude: -23.5534,
      longitude: -46.6918,
    });
    expect(parsed.stops[1].location).toEqual({
      latitude: -23.9608,
      longitude: -46.3336,
    });
    expect(parsed.stops[0].placeId).toBe("0x94ce57:0x1");
    expect(parsed.travelMode).toBe("driving");
    expect(parsed.travelModeDocumented).toBe(false);
    expect(parsed.travelModeEvidence).toContain("!3e0");
    expect(parsed.viewport?.zoom).toBe(10);
    expect(parsed.viewport?.center.latitude).toBeCloseTo(-23.75, 5);
  });

  it("treats a via: waypoint as a pass-through coordinate", () => {
    const sample = sampleById("via-masp-congonhas");
    const parsed = parseMapsUrl(sample.url);
    expect(parsed.stops.map((stop) => stop.role)).toEqual([
      "origin",
      "via",
      "destination",
    ]);
    expect(parsed.stops[1].via).toBe(true);
    expect(parsed.stops[1].location).toEqual({
      latitude: -23.59,
      longitude: -46.64,
    });
    expect(parsed.stops.every((stop) => stop.location)).toBe(true);
  });

  it("interprets a google.com.br data-blob travel mode as partial evidence", () => {
    const sample = sampleById("pinheiros-ibirapuera");
    const parsed = parseMapsUrl(sample.url);
    expect(parsed.kind).toBe("directions_path");
    expect(parsed.travelMode).toBe("walking");
    expect(parsed.travelModeDocumented).toBe(false);
    expect(parsed.stops).toHaveLength(2);
    const report = assessRecoverability(parsed);
    const mode = report.items.find((item) => item.id === "travel-mode");
    expect(mode?.status).toBe("partial");
  });

  it("parses legacy saddr, daddr, and dirflg", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps?saddr=Pinheiros,+S%C3%A3o+Paulo&daddr=Mercado+Municipal+to:MASP,+S%C3%A3o+Paulo&dirflg=dt",
    );
    expect(parsed.kind).toBe("legacy");
    expect(parsed.stops.map((stop) => stop.label)).toEqual([
      "Pinheiros, São Paulo",
      "Mercado Municipal",
      "MASP, São Paulo",
    ]);
    expect(parsed.travelMode).toBe("driving");
    expect(parsed.avoid.tolls).toBe(true);
    expect(parsed.avoid.highways).toBeNull();
  });

  it("classifies short links without fetching them", () => {
    const parsed = parseMapsUrl("https://maps.app.goo.gl/exampleRoute");
    expect(parsed.kind).toBe("short_link");
    expect(parsed.shortLink).toBe(true);
    expect(parsed.stops).toHaveLength(0);
  });

  it("rejects a non-maps host and a place page", () => {
    expect(parseMapsUrl("https://example.com/maps/dir/A/B").kind).toBe("invalid");
    expect(parseMapsUrl("not a url").kind).toBe("invalid");
    expect(parseMapsUrl("https://www.google.com/maps/place/MASP").kind).toBe(
      "unsupported",
    );
  });

  it("keeps an explicit polyline and ignores undocumented integers as a route index", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/dir/A/B/data=!1i7!3e0?polyline=_p~iF~ps|U",
    );
    expect(parsed.encodedPolyline).toBe("_p~iF~ps|U");
    expect(parsed.polylineFromExtension).toBe(true);
    expect(parsed.undocumentedIntegers).toEqual([7]);
    const report = assessRecoverability(parsed);
    expect(report.geometryPresentInUrl).toBe(true);
    expect(report.items.find((item) => item.id === "selected-alternative")?.status).toBe(
      "inconclusive",
    );
    const fidelity = diagnoseFidelity(parsed, [], "mock");
    expect(fidelity.verdict).toBe("polyline_in_url");
    expect(fidelity.selectedRoutePreserved).toBe(true);
  });

  it("warns when coordinate and stop counts differ", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/dir/Alpha/Beta/data=!2m2!1d-46.6!2d-23.5",
    );
    expect(parsed.stops[0].location?.latitude).toBeCloseTo(-23.5, 5);
    expect(parsed.stops[1].location).toBeNull();
    expect(parsed.warnings.some((warning) => warning.includes("Coordinate count"))).toBe(
      true,
    );
  });
});

describe("recoverability of a normal share", () => {
  it("says the selected route was not encoded", () => {
    const parsed = parseMapsUrl(sampleById("congonhas-masp").url);
    const report = assessRecoverability(parsed);
    expect(report.canReconstructStops).toBe(true);
    expect(report.geometryPresentInUrl).toBe(false);
    expect(report.items.find((item) => item.id === "encoded-polyline")?.status).toBe(
      "not_encoded",
    );
    expect(report.items.find((item) => item.id === "route-token")?.status).toBe(
      "not_encoded",
    );
    expect(report.summary).toContain("not in the URL");
    const fidelity = diagnoseFidelity(parsed, [], "mock");
    expect(fidelity.selectedRoutePreserved).toBe(false);
    expect(fidelity.verdict).toBe("not_preserved");
  });

  it("marks a via point as constrained rather than preserved", () => {
    const parsed = parseMapsUrl(sampleById("via-masp-congonhas").url);
    const fidelity = diagnoseFidelity(parsed, [], "mock");
    expect(fidelity.verdict).toBe("constrained_not_proven");
    expect(fidelity.selectedRoutePreserved).toBe(false);
    expect(fidelity.headline).toContain("not preserved");
  });
});

describe("feasibility report", () => {
  it("records both hypotheses and the rejection of the main one", () => {
    const report = readFileSync(
      path.join(process.cwd(), "docs", "FEASIBILITY.md"),
      "utf8",
    );
    expect(report).toContain("## Hypothesis H1");
    expect(report).toContain("## Hypothesis H2");
    expect(report).toContain("not supported");
    expect(report).toContain("NO-GO");
    expect(report).toContain("longitude then latitude");
    expect(report).toContain("not a Windows checkout");
    expect(report).toContain("does not mount a local user profile");
    expect(report).not.toMatch(/[A-Za-z]:\\Users\\/);
    expect(report).not.toMatch(/on host `/);
  });
});

function sampleById(id: string) {
  const sample = SAMPLES.find((item) => item.id === id);
  if (!sample) {
    throw new Error(`Missing sample ${id}`);
  }
  return sample;
}
