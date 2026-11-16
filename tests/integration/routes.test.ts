import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as importPost } from "@/app/api/routes/import/route";
import { POST as reconstructPost } from "@/app/api/routes/reconstruct/route";
import { GET as statusGet } from "@/app/api/routes/status/route";
import { SAMPLES } from "@/lib/route-overlay/samples";
import { importMapsUrl, reconstructFromUrl } from "@/lib/route-overlay/service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.ROUTE_OVERLAY_GOOGLE_API_ENABLED;
  delete process.env.GOOGLE_ROUTES_API_KEY;
});

describe("import route handler", () => {
  it("returns origin, destination, and the waypoint for the Maps URLs sample", async () => {
    const response = await importPost(jsonRequest({ url: SAMPLES[0].url }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.parsed.stops.map((stop: { label: string }) => stop.label)).toEqual([
      "Congonhas Airport, São Paulo",
      "Mercado Municipal de São Paulo",
      "MASP, Avenida Paulista, São Paulo",
    ]);
    expect(body.recoverability.canReconstructStops).toBe(true);
    expect(body.recoverability.geometryPresentInUrl).toBe(false);
  });

  it("rejects an empty body and a non-URL", async () => {
    const empty = await importPost(jsonRequest({ url: "   " }));
    expect(empty.status).toBe(400);
    const garbage = await importPost(jsonRequest({ url: "not a url" }));
    expect(garbage.status).toBe(400);
    const payload = await garbage.json();
    expect(payload.error).toMatch(/absolute URL/i);
  });

  it("expands a short link only through the injected fetch", async () => {
    const target = SAMPLES[1].url;
    const resolveHost = async () => ["142.250.190.14"];
    const outcome = await importMapsUrl("https://maps.app.goo.gl/abcDEF123", {
      resolveHost,
      fetchImpl: async () =>
        new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }) as Response,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.parsed.kind).toBe("short_link");
    }

    const calls: Array<{ url: string; redirect: string | undefined }> = [];
    const expanded = await importMapsUrl("https://maps.app.goo.gl/abcDEF123", {
      resolveHost,
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, redirect: init?.redirect });
        if (url.startsWith("https://maps.app.goo.gl/")) {
          return new Response(null, {
            status: 302,
            headers: { Location: target },
          });
        }
        return new Response("<html></html>", { status: 200 });
      },
    });
    expect(expanded.ok).toBe(true);
    expect(calls.map((call) => call.url)).toEqual([
      "https://maps.app.goo.gl/abcDEF123",
      target,
    ]);
    expect(calls.every((call) => call.redirect === "manual")).toBe(true);
    if (expanded.ok) {
      expect(expanded.result.parsed.expandedFrom).toBe("https://maps.app.goo.gl/abcDEF123");
      expect(expanded.result.parsed.stops[0].label).toBe("Vila Madalena, São Paulo");
      expect(expanded.result.parsed.stops[1].location?.latitude).toBeCloseTo(-23.9608, 4);
    }
  });

  it("does not expand a short link when expansion is turned off", async () => {
    const fetchImpl = vi.fn();
    const outcome = await importMapsUrl("https://maps.app.goo.gl/abcDEF123", {
      expandShortLinks: false,
      fetchImpl,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.recoverability.canReconstructStops).toBe(false);
    }
  });
});

describe("reconstruct route handler", () => {
  it("returns a labeled mock result from the route handler", async () => {
    const response = await reconstructPost(
      jsonRequest({ url: SAMPLES[0].url, mode: "mock" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.reconstruction.mock).toBe(true);
    expect(body.reconstruction.label).toContain("MOCK");
    expect(body.reconstruction.fidelity.selectedRoutePreserved).toBe(false);
    expect(body.reconstruction.fidelity.headline).toContain("not preserved");
  });

  it("refuses live reconstruction while the API is disabled", async () => {
    const response = await reconstructPost(
      jsonRequest({ url: SAMPLES[2].url, mode: "live" }),
    );
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toMatch(/not true|empty/i);
    expect(body.googleApi.liveAvailable).toBe(false);
    expect(JSON.stringify(body)).not.toContain("encodedPolyline");
  });

  it("calls Google only when the handler is explicitly enabled", async () => {
    process.env.ROUTE_OVERLAY_GOOGLE_API_ENABLED = "true";
    process.env.GOOGLE_ROUTES_API_KEY = "integration-test-key";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://routes.googleapis.com/directions/v2:computeRoutes",
      );
      return new Response(
        JSON.stringify({
          routes: [
            {
              distanceMeters: 4200,
              duration: "600s",
              polyline: { encodedPolyline: "_p~iF~ps|U" },
              description: "Test road",
              routeLabels: ["DEFAULT_ROUTE"],
            },
          ],
        }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchImpl as typeof fetch;
    const response = await reconstructPost(
      jsonRequest({ url: SAMPLES[2].url, mode: "live" }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(body.reconstruction.mock).toBe(false);
    expect(body.reconstruction.source).toBe("google_routes_api");
    expect(body.reconstruction.fidelity.selectedRoutePreserved).toBe(false);
    expect(JSON.stringify(body)).not.toContain("integration-test-key");
  });

  it("returns 422 when the stops are incomplete", async () => {
    const outcome = await reconstructFromUrl(
      "https://www.google.com/maps/dir/?api=1&origin=Only+an+origin",
      "mock",
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.status).toBe(422);
    }
  });
});

describe("status route handler", () => {
  it("reports that live calls are unavailable by default", async () => {
    const response = statusGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.liveAvailable).toBe(false);
    expect(body.reason).toMatch(/Mock reconstruction/i);
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/routes/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
