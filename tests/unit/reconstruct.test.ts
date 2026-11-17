import { describe, expect, it, vi } from "vitest";
import {
  buildRoutesRequest,
  computeGoogleRoutes,
  googleApiStatus,
  readGoogleApiConfig,
  redactSecrets,
} from "@/lib/route-overlay/google-routes";
import { memoryLiveBudgetStore } from "@/lib/route-overlay/live-budget";
import { selectedPolylineRendered } from "@/lib/route-overlay/map-readiness";
import { reconstructMock } from "@/lib/route-overlay/mock-reconstruct";
import { parseMapsUrl } from "@/lib/route-overlay/parse-maps-url";
import { SAMPLES } from "@/lib/route-overlay/samples";

describe("mock reconstruction", () => {
  it("labels sample geometry as a local fixture and never as a Google response", () => {
    const parsed = parseMapsUrl(SAMPLES[0].url);
    const result = reconstructMock(parsed);
    expect(result.mock).toBe(true);
    expect(result.source).toBe("mock");
    expect(result.label).toContain("MOCK");
    expect(result.geometryProvenance).toBe("synthetic_from_local_sample_fixture");
    expect(result.provenanceNote).toMatch(/not recovered from the link/i);
    expect(result.routes).toHaveLength(2);
    expect(result.routes.every((route) => route.synthetic && route.source === "mock")).toBe(
      true,
    );
    expect(result.routes[0].encodedPolyline).not.toBe(result.routes[1].encodedPolyline);
    expect(result.disclaimer.toLowerCase()).not.toContain("google routes api returned");
    expect(result.fidelity.selectedRoutePreserved).toBe(false);
    expect(result.googleApi.attempted).toBe(false);
  });

  it("bends a corridor through coordinates that were actually in the URL", () => {
    const parsed = parseMapsUrl(SAMPLES[1].url);
    const result = reconstructMock(parsed);
    expect(result.geometryProvenance).toBe("synthetic_from_url_coordinates");
    expect(result.mapStops).toHaveLength(2);
    expect(result.routes[0].distanceMeters).toBeGreaterThan(0);
  });

  it("does not invent a polyline for a name-only URL without a fixture", () => {
    const parsed = parseMapsUrl(SAMPLES[3].url);
    const result = reconstructMock(parsed);
    expect(result.geometryProvenance).toBe("none");
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0].encodedPolyline).toBeNull();
    expect(result.routes[0].distanceMeters).toBeNull();
    expect(result.mapStops).toHaveLength(0);
  });
});

describe("Google Routes client", () => {
  it("stays disabled when the flag and key are absent", () => {
    const status = googleApiStatus(readGoogleApiConfig({} as NodeJS.ProcessEnv));
    expect(status.liveAvailable).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.configured).toBe(false);
  });

  it("does not call fetch when live mode is disabled", async () => {
    const fetchImpl = vi.fn();
    const parsed = parseMapsUrl(SAMPLES[2].url);
    const result = await computeGoogleRoutes(parsed, {
      config: { enabled: false, apiKey: "" },
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.googleApi.attempted).toBe(false);
    expect(result.routes).toHaveLength(0);
  });

  it("requests alternatives only when a driving route has no intermediate waypoints", () => {
    const via = parseMapsUrl(SAMPLES[2].url);
    const viaRequest = buildRoutesRequest(via);
    expect(viaRequest.body.travelMode).toBe("DRIVE");
    expect(viaRequest.body.computeAlternativeRoutes).toBeUndefined();
    expect(viaRequest.warning).toMatch(/alternative routes were not requested/i);
    expect(viaRequest.body.routingPreference).toBe("TRAFFIC_UNAWARE");
    const intermediates = viaRequest.body.intermediates as Array<Record<string, unknown>>;
    expect(intermediates).toHaveLength(1);
    expect(intermediates[0].via).toBe(true);
    expect(JSON.stringify(viaRequest.body)).not.toContain("apiKey");

    const direct = parseMapsUrl(SAMPLES[1].url);
    const directRequest = buildRoutesRequest(direct);
    expect(directRequest.body.computeAlternativeRoutes).toBe(true);
  });

  it("parses a live fixture without leaking the key", async () => {
    const secret = "super-secret-key";
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 1500,
              duration: "240s",
              polyline: { encodedPolyline: "_p~iF~ps|U" },
              description: "Marginal Pinheiros",
              routeLabels: ["DEFAULT_ROUTE"],
              warnings: [],
            },
            {
              distanceMeters: 1800,
              duration: "300s",
              polyline: { encodedPolyline: "_p~iF~ps|U_ulL" },
              description: "Alternate",
              routeLabels: [],
            },
          ],
          echo: secret,
        }),
        { status: 200 },
      );
    });
    const parsed = parseMapsUrl(SAMPLES[2].url);
    const result = await computeGoogleRoutes(parsed, {
      config: { enabled: true, apiKey: secret },
      fetchImpl,
    });
    expect(result.mock).toBe(false);
    expect(result.source).toBe("google_routes_api");
    expect(result.label).toContain("LIVE");
    expect(result.routes[0].synthetic).toBe(false);
    expect(result.routes[0].durationSeconds).toBe(240);
    expect(result.fidelity.selectedRoutePreserved).toBe(false);
    expect(JSON.stringify(result)).not.toContain(secret);
    const init = fetchImpl.mock.calls[0][1];
    const headers = init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(secret);
    expect(headers["X-Goog-FieldMask"]).toContain("routes.polyline.encodedPolyline");
  });

  it("redacts the key from an error body", () => {
    expect(redactSecrets("bad key super-secret-key in body", "super-secret-key")).toBe(
      "bad key [redacted] in body",
    );
  });

  it("keeps a single returned route and does not invent alternatives", async () => {
    const result = await computeGoogleRoutes(parseMapsUrl(SAMPLES[1].url), {
      config: { enabled: true, apiKey: "test-key" },
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            routes: [
              {
                distanceMeters: 80000,
                duration: "5400s",
                polyline: { encodedPolyline: "_p~iF~ps|U" },
                routeLabels: ["DEFAULT_ROUTE"],
              },
            ],
          }),
          { status: 200 },
        ),
    });
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]?.label).toBe("Google default route");
    expect(result.routes[0]?.encodedPolyline).toBe("_p~iF~ps|U");
    expect(result.mock).toBe(false);
  });

  it("reports an empty Routes response without synthetic geometry", async () => {
    const result = await computeGoogleRoutes(parseMapsUrl(SAMPLES[1].url), {
      config: { enabled: true, apiKey: "test-key" },
      fetchImpl: async () => new Response(JSON.stringify({ routes: [] }), { status: 200 }),
    });
    expect(result.routes).toHaveLength(0);
    expect(result.geometryProvenance).toBe("none");
    expect(result.googleApi.error).toMatch(/no routes/i);
    expect(result.mock).toBe(false);
  });

  it("surfaces billing and quota failures and does not retry", async () => {
    const billingFetch = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          error: { code: 403, message: "Billing has not been enabled for this project.", status: "PERMISSION_DENIED" },
        }),
        { status: 403 },
      ),
    );
    const billing = await computeGoogleRoutes(parseMapsUrl(SAMPLES[1].url), {
      config: { enabled: true, apiKey: "test-key" },
      fetchImpl: billingFetch,
    });
    expect(billingFetch).toHaveBeenCalledOnce();
    expect(billing.routes).toHaveLength(0);
    expect(billing.googleApi.error).toMatch(/billing or permission/i);
    expect(billing.mock).toBe(false);

    const quotaFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: { message: "Quota exceeded for computeRoutes." } }), {
        status: 429,
      }),
    );
    const quota = await computeGoogleRoutes(parseMapsUrl(SAMPLES[1].url), {
      config: { enabled: true, apiKey: "test-key" },
      fetchImpl: quotaFetch,
    });
    expect(quotaFetch).toHaveBeenCalledOnce();
    expect(quota.googleApi.error).toMatch(/quota error/i);
    expect(quota.routes).toHaveLength(0);
  });

  it("stops before fetch when the local computeRoutes cap is exhausted", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const result = await computeGoogleRoutes(parseMapsUrl(SAMPLES[1].url), {
      config: { enabled: true, apiKey: "test-key" },
      fetchImpl,
      countLiveRequest: true,
      budgetStore: memoryLiveBudgetStore({ computeRoutesCalls: 20, mapLoads: 0 }),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.googleApi.error).toMatch(/20 computeRoutes/);
    expect(result.routes).toHaveLength(0);
  });
});

describe("map confirmation readiness", () => {
  it("requires the selected polyline to be the one that was drawn", () => {
    expect(
      selectedPolylineRendered({
        selectedPolyline: "abc",
        renderedPolyline: "abc",
        mapReportedReady: true,
      }),
    ).toBe(true);
    expect(
      selectedPolylineRendered({
        selectedPolyline: "abc",
        renderedPolyline: "other",
        mapReportedReady: true,
      }),
    ).toBe(false);
    expect(
      selectedPolylineRendered({
        selectedPolyline: "abc",
        renderedPolyline: "abc",
        mapReportedReady: false,
      }),
    ).toBe(false);
  });
});
