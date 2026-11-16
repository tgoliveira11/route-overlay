import { describe, expect, it, vi } from "vitest";
import { presentCandidates } from "@/lib/route-overlay/candidates";
import { confirmationEligibility, routingRevision } from "@/lib/route-overlay/revision";
import { buildRoutesRequest, computeGoogleRoutes } from "@/lib/route-overlay/google-routes";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import { applyDraft, createDraftWaypoint } from "@/lib/route-overlay/refinement";
import { scenarioById } from "@/lib/route-overlay/scenarios";
import { importMapsUrl, reconstructFromUrl } from "@/lib/route-overlay/service";
import { planStopsAlongPolyline } from "@/lib/route-overlay/stop-plan";

describe("assisted import to stop planning", () => {
  it("imports a real Santos–Montevideo URL and offers mock candidates", async () => {
    const imported = await importMapsUrl(scenarioById("A").url);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.result.parsed.stops[0].label).toMatch(/Santos/);
    expect(imported.result.parsed.stops.at(-1)?.label).toMatch(/Montevideo/);
    expect(imported.result.recoverability.geometryPresentInUrl).toBe(false);

    const reconstructed = await reconstructFromUrl(scenarioById("A").url, "mock");
    expect(reconstructed.ok).toBe(true);
    if (!reconstructed.ok) {
      return;
    }
    expect(reconstructed.reconstruction.mock).toBe(true);
    const candidates = presentCandidates(reconstructed.parsed, reconstructed.reconstruction);
    expect(candidates.candidates.length).toBeGreaterThan(1);
    const chosen = candidates.candidates[1];
    expect(chosen.route.encodedPolyline).toBeTruthy();
    const plan = planStopsAlongPolyline(chosen.route.encodedPolyline ?? "", {
      fuel: "gasoline",
      rangeKm: 500,
      reserveKm: 80,
      maxDetourKm: 40,
      intervalKm: 350,
      prefer24h: false,
    });
    expect(plan.stops).toHaveLength(0);
    expect(plan.feasible).toBe(false);
    expect(plan.gaps.some((gap) => /usable range/i.test(gap))).toBe(true);
    expect(plan.disclaimer).toMatch(/not real businesses/i);
    expect(plan.detourMethod).toBe("straight_line");
  });

  it("keeps waypoint order and withholds alternatives after refinement", async () => {
    const imported = await importMapsUrl(scenarioById("A").url);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const draft = createDraftWaypoint("-33.6900, -53.4600", "chui");
    expect("error" in draft).toBe(false);
    if ("error" in draft) {
      return;
    }
    const revised = applyDraft(imported.result.parsed, [draft]);
    const reconstructed = await reconstructFromUrl(revised.normalizedUrl, "mock");
    expect(reconstructed.ok).toBe(true);
    if (!reconstructed.ok) {
      return;
    }
    expect(reconstructed.parsed.stops.map((stop) => stop.role)).toEqual([
      "origin",
      "waypoint",
      "destination",
    ]);
    const candidates = presentCandidates(reconstructed.parsed, reconstructed.reconstruction);
    expect(candidates.alternativesAvailable).toBe(false);
    expect(candidates.candidates).toHaveLength(1);
  });

  it("classifies a place page as unsupported and refuses reconstruction", async () => {
    const imported = await importMapsUrl(scenarioById("G").url);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    expect(imported.result.parsed.kind).toBe("unsupported");
    expect(imported.result.recoverability.canReconstructStops).toBe(false);
    const reconstructed = await reconstructFromUrl(scenarioById("G").url, "mock");
    expect(reconstructed.ok).toBe(false);
    if (!reconstructed.ok) {
      expect(reconstructed.status).toBe(422);
    }
  });

  it("refuses to confirm the previous geometry after a waypoint is added", async () => {
    const imported = await importMapsUrl(scenarioById("A").url);
    expect(imported.ok).toBe(true);
    if (!imported.ok) {
      return;
    }
    const first = await reconstructFromUrl(imported.result.parsed.normalizedUrl, "mock");
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const before = routingRevision(imported.result.parsed);
    const draft = createDraftWaypoint("-33.6900, -53.4600", "chui");
    expect("error" in draft).toBe(false);
    if ("error" in draft) {
      return;
    }
    const revised = applyDraft(imported.result.parsed, [draft]);
    const blocked = confirmationEligibility({
      draftRevision: routingRevision(revised),
      geometryRevision: before,
      mock: true,
      mapsDisplayReady: false,
      candidateConfirmable: true,
    });
    expect(blocked.allowed).toBe(false);
    const second = await reconstructFromUrl(revised.normalizedUrl, "mock");
    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.parsed.stops.map((stop) => stop.role)).toEqual([
      "origin",
      "waypoint",
      "destination",
    ]);
    expect(second.parsed.stops[1].location?.latitude).toBeCloseTo(-33.69, 2);
    const offered = presentCandidates(second.parsed, second.reconstruction);
    expect(offered.candidates).toHaveLength(1);
    expect(
      confirmationEligibility({
        draftRevision: routingRevision(revised),
        geometryRevision: routingRevision(revised),
        mock: true,
        mapsDisplayReady: false,
        candidateConfirmable: Boolean(offered.candidates[0]?.confirmable),
      }).allowed,
    ).toBe(true);
    expect(offered.candidates[0]?.route.encodedPolyline).not.toBe(
      first.reconstruction.routes[0]?.encodedPolyline,
    );
  });

  it("refuses live reconstruction while Google credentials are absent", async () => {
    const outcome = await reconstructFromUrl(scenarioById("D").url, "live");
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(409);
      expect(outcome.googleApi?.liveAvailable).toBe(false);
    }
  });

  it("uses a mocked HTTP response for the live adapter and does not call it for waypoint alternatives", async () => {
    const direct = parseMapsUrl(scenarioById("A").url);
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 1900000,
              duration: "90000s",
              polyline: { encodedPolyline: "_p~iF~ps|U" },
              description: "Mocked HTTP fixture, not a live Google call",
              routeLabels: ["DEFAULT_ROUTE"],
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const live = await computeGoogleRoutes(direct, {
      config: { enabled: true, apiKey: "test-key-not-real" },
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const init = fetchImpl.mock.calls[0]?.[1];
    const body = JSON.parse(String(init && "body" in init ? init.body : ""));
    expect(body.computeAlternativeRoutes).toBe(true);
    expect(live.mock).toBe(false);
    expect(live.source).toBe("google_routes_api");
    expect(JSON.stringify(live)).not.toContain("test-key-not-real");

    const withStop = parseMapsUrl(scenarioById("D").url);
    const blocked = buildRoutesRequest(withStop);
    expect(blocked.body.computeAlternativeRoutes).toBeUndefined();
    expect(JSON.stringify(blocked.body)).not.toContain("test-key-not-real");
  });
});
