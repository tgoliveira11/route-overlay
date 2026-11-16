import { describe, expect, it } from "vitest";
import { diagnoseFidelity } from "@/lib/route-overlay/fidelity";
import { stopTitle } from "@/lib/route-overlay/geo";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import { assessRecoverability } from "@/lib/route-overlay/recoverability";
import { reconstructMock } from "@/lib/route-overlay/mock-reconstruct";

/**
 * Redirect targets captured with an HTTP 302 on 2026-11-16.
 * Sources are public Stack Overflow posts, not URLs invented for this suite.
 * https://stackoverflow.com/questions/79633170
 * https://stackoverflow.com/questions/63026787
 * https://stackoverflow.com/questions/69853742
 */
const LONDON_DEFAULT =
  "https://www.google.com/maps/dir/51.5199302,-0.1103523/51.5070144,-0.1084179/@51.5131116,-0.114774,2318m/data=!3m1!1e3!4m5!4m4!1m0!1m1!4e1!3e0!5m1!1e1?entry=tts&g_ep=EgoyMDI1MDUxNS4xKgBIAVAD&skid=18184f58-3e22-4f43-8277-9277a041cbdf";

const LONDON_OTHER =
  "https://www.google.com/maps/dir/51.5199302,-0.1103523/51.5070144,-0.1084179/@51.5131116,-0.114774,2400m/data=!3m1!1e3!4m6!4m5!1m0!1m1!4e1!3e0!5i2!5m1!1e1?entry=tts&g_ep=EgoyMDI1MDUxNS4xKgBIAVAD&skid=64a2fa25-7304-4c95-a32b-c747c2d99030";

const TEMPE =
  "https://www.google.com/maps/dir/33.3776464,-112.0612261/Tempe+Municipal+Court,+East+5th+Street,+Tempe,+Arizona/@33.4104285,-112.0288578,16077m/am=t/data=!3m1!1e3!4m14!4m13!1m0!1m5!1m1!1s0x872b08d863d3c753:0xe8c09d937f459b5d!2m2!1d-111.9373967!2d33.4256807!2m4!4e3!6e0!7e2!8j1751276700!3e3?entry=tts&g_ep=EgoyMDI1MDYyMy4yIPu8ASoASAFQAw%3D%3D&skid=5d4997cc-4a26-49c3-a513-8a95528de7d7";

const EIFFEL_LIVE =
  "https://www.google.com/maps/dir/Eiffel+Tower,+Paris,+France/Palais+Garnier,+Pl.+de+l'Op%C3%A9ra,+75009+Paris,+France/@48.8617881,2.303902,15z/am=t/data=!4m14!4m13!1m5!1m1!1s0x47e6701f7e8337b5:0xa2cb58dd28914524!2m2!1d2.2930458!2d48.8560934!1m5!1m1!1s0x47e66e30d4668339:0xa9abf21c286d0767!2m2!1d2.3316014!2d48.8719697!3e0?shorturl=1";

/** Address bar after clicking the second Santos–Montevideo alternative on 2026-11-16. */
const SANTOS_ALTERNATIVE =
  "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/@-28.9739549,-62.0565642,5z/data=!4m19!4m18!1m9!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9539549!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D";

/** Address bar after a third stop was added. The form and the path both list Porto Alegre last. */
const SANTOS_THREE_STOPS =
  "https://www.google.com/maps/dir/Santos,+S%C3%A3o+Paulo,+Brazil/Montevideo,+Montevideo+Department,+Uruguay/Porto+Alegre,+RS,+Brazil/@-29.2820701,-56.5451002,6z/data=!3m1!4b1!4m20!4m19!1m5!1m1!1s0x94ce03b97cc7856f:0x3ff3e507b04bbc46!2m2!1d-46.3317787!2d-23.9592201!1m5!1m1!1s0x959f80ffc63bf7d3:0x6b321b2e355bec99!2m2!1d-56.1851147!2d-34.9055016!1m5!1m1!1s0x95199cd2566acb1d:0x603111a89f87e91f!2m2!1d-51.2089887!2d-30.0368176!3e0?entry=ttu&g_ep=EgoyMDI2MTExMC4wIKXMDSoASAFQAw%3D%3D";

describe("real shared directions URLs", () => {
  it("reads coordinates from the path of two London shares and does not treat !5i2 as geometry", () => {
    const first = parseMapsUrl(LONDON_DEFAULT);
    const second = parseMapsUrl(LONDON_OTHER);

    expect(first.stops.map((stop) => stop.location)).toEqual([
      { latitude: 51.5199302, longitude: -0.1103523 },
      { latitude: 51.5070144, longitude: -0.1084179 },
    ]);
    expect(second.stops.map((stop) => [stop.location?.latitude, stop.location?.longitude])).toEqual(
      first.stops.map((stop) => [stop.location?.latitude, stop.location?.longitude]),
    );
    expect(first.encodedPolyline).toBeNull();
    expect(second.encodedPolyline).toBeNull();
    expect(first.undocumentedIntegers).toEqual([]);
    expect(second.undocumentedIntegers).toEqual([2]);
    expect(second.uninterpretedBlobFields).not.toContain("!5i2");

    const firstFidelity = diagnoseFidelity(first, [], "mock");
    const secondFidelity = diagnoseFidelity(second, [], "mock");
    expect(firstFidelity.selectedRoutePreserved).toBe(false);
    expect(secondFidelity.selectedRoutePreserved).toBe(false);
    expect(firstFidelity.verdict).toBe("not_preserved");
    expect(secondFidelity.verdict).toBe("not_preserved");

    const report = assessRecoverability(second);
    expect(report.items.find((item) => item.id === "selected-alternative")?.status).toBe(
      "inconclusive",
    );
    expect(report.items.find((item) => item.id === "encoded-polyline")?.status).toBe(
      "not_encoded",
    );
    expect(report.geometryPresentInUrl).toBe(false);
  });

  it("keeps a Tempe share's !8j field inconclusive and does not invent a departure", () => {
    const parsed = parseMapsUrl(TEMPE);
    expect(stopTitle(parsed.stops[0])).toContain("33.3776");
    expect(parsed.stops[1].label).toContain("Tempe Municipal Court");
    expect(parsed.stops[1].location).toEqual({
      latitude: 33.4256807,
      longitude: -111.9373967,
    });
    expect(parsed.travelMode).toBe("transit");
    expect(parsed.travelModeDocumented).toBe(false);
    expect(parsed.uninterpretedBlobFields).toContain("!8j1751276700");
    expect(parsed.departureTime).toBeNull();
    const departure = assessRecoverability(parsed).items.find(
      (item) => item.id === "departure-time",
    );
    expect(departure?.status).toBe("inconclusive");
    expect(departure?.detail).toContain("not treated as a recovered departure time");
    expect(parsed.encodedPolyline).toBeNull();
  });

  it("parses the live Eiffel Tower redirect as two stops, not the 2021 via-point list", () => {
    const parsed = parseMapsUrl(EIFFEL_LIVE);
    expect(parsed.stops.map((stop) => stop.label)).toEqual([
      "Eiffel Tower, Paris, France",
      "Palais Garnier, Pl. de l'Opéra, 75009 Paris, France",
    ]);
    expect(parsed.stops[0].location).toEqual({
      latitude: 48.8560934,
      longitude: 2.2930458,
    });
    expect(parsed.stops.filter((stop) => stop.role === "waypoint" || stop.role === "via")).toHaveLength(
      0,
    );
    expect(diagnoseFidelity(parsed, [], "mock").selectedRoutePreserved).toBe(false);
  });

  it("recovers Santos and Montevideo from the clicked desktop alternative without a polyline", () => {
    const parsed = parseMapsUrl(SANTOS_ALTERNATIVE);
    expect(parsed.stops[0].label).toBe("Santos, São Paulo, Brazil");
    expect(parsed.stops[0].location?.latitude).toBeCloseTo(-23.9539549, 5);
    expect(parsed.stops[1].label).toContain("Montevideo");
    expect(parsed.stops[1].location).toEqual({
      latitude: -34.9055016,
      longitude: -56.1851147,
    });
    expect(parsed.travelMode).toBe("driving");
    expect(parsed.travelModeDocumented).toBe(false);
    expect(parsed.encodedPolyline).toBeNull();
    expect(parsed.routeToken).toBeNull();
    const mock = reconstructMock(parsed);
    expect(mock.mock).toBe(true);
    expect(mock.fidelity.selectedRoutePreserved).toBe(false);
    expect(mock.label).toContain("MOCK");
  });

  it("preserves three named stops in path order and still does not preserve the roads", () => {
    const parsed = parseMapsUrl(SANTOS_THREE_STOPS);
    expect(parsed.stops.map((stop) => stop.role)).toEqual([
      "origin",
      "waypoint",
      "destination",
    ]);
    expect(parsed.stops.map((stop) => stop.label)).toEqual([
      "Santos, São Paulo, Brazil",
      "Montevideo, Montevideo Department, Uruguay",
      "Porto Alegre, RS, Brazil",
    ]);
    expect(parsed.stops[2].location?.latitude).toBeCloseTo(-30.0368176, 5);
    expect(parsed.stops.every((stop) => stop.via)).toBe(false);
    expect(diagnoseFidelity(parsed, [], "mock").verdict).toBe("not_preserved");
  });

  it("treats the documented avoid parameter as recovered", () => {
    const parsed = parseMapsUrl(
      "https://www.google.com/maps/dir/?api=1&origin=Santos&destination=Montevideo&travelmode=driving&avoid=tolls,ferries",
    );
    expect(parsed.avoidDocumented).toBe(true);
    expect(parsed.avoid.tolls).toBe(true);
    expect(parsed.avoid.ferries).toBe(true);
    expect(parsed.warnings.some((warning) => warning.includes("not part of the documented"))).toBe(
      false,
    );
    const item = assessRecoverability(parsed).items.find((entry) => entry.id === "avoid");
    expect(item?.status).toBe("recovered");
  });
});
