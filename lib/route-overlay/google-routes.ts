import { diagnoseFidelity } from "@/lib/route-overlay/fidelity";
import { formatCoordinate } from "@/lib/route-overlay/geo";
import {
  reserveLiveCall,
  type LiveBudgetStore,
} from "@/lib/route-overlay/live-budget";
import type {
  GeoPoint,
  GoogleApiStatus,
  ParsedMapsUrl,
  ReconstructionResult,
  ReconstructedRoute,
  RouteStop,
  TravelMode,
} from "@/lib/route-overlay/types";

const ROUTES_ENDPOINT =
  "https://routes.googleapis.com/directions/v2:computeRoutes";

const FIELD_MASK = [
  "routes.distanceMeters",
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.description",
  "routes.routeLabels",
  "routes.warnings",
].join(",");

const TRAVEL_MODE_TO_API: Record<TravelMode, string> = {
  driving: "DRIVE",
  walking: "WALK",
  bicycling: "BICYCLE",
  transit: "TRANSIT",
  two_wheeler: "TWO_WHEELER",
  unknown: "DRIVE",
};

export interface GoogleApiConfig {
  enabled: boolean;
  apiKey: string;
}

export function readGoogleApiConfig(
  env: NodeJS.ProcessEnv = process.env,
): GoogleApiConfig {
  return {
    enabled: env.ROUTE_OVERLAY_GOOGLE_API_ENABLED === "true",
    apiKey: (env.GOOGLE_ROUTES_API_KEY ?? "").trim(),
  };
}

export function googleApiStatus(config: GoogleApiConfig): GoogleApiStatus {
  const configured = config.apiKey.length > 0;
  const liveAvailable = config.enabled && configured;
  let reason: string;
  if (!config.enabled && !configured) {
    reason =
      "Live calls are off. ROUTE_OVERLAY_GOOGLE_API_ENABLED is not true, and GOOGLE_ROUTES_API_KEY is empty. Mock reconstruction does not need either value.";
  } else if (!config.enabled) {
    reason =
      "A key is present, but ROUTE_OVERLAY_GOOGLE_API_ENABLED is not true, so RouteOverlay will not call Google.";
  } else if (!configured) {
    reason =
      "ROUTE_OVERLAY_GOOGLE_API_ENABLED is true, but GOOGLE_ROUTES_API_KEY is empty.";
  } else {
    reason = "Live Google Routes API calls are enabled for this process.";
  }
  return {
    enabled: config.enabled,
    configured,
    liveAvailable,
    reason,
    mapsDisplayAvailable: false,
    mapsJsKey: null,
  };
}

export function buildRoutesRequest(parsed: ParsedMapsUrl): {
  body: Record<string, unknown>;
  warning: string | null;
} {
  const origin = parsed.stops.find((stop) => stop.role === "origin");
  const destination = parsed.stops.find((stop) => stop.role === "destination");
  if (!origin || !destination) {
    throw new Error("Origin and destination are required.");
  }

  const intermediates = parsed.stops.filter(
    (stop) => stop.role === "waypoint" || stop.role === "via",
  );
  const mode = parsed.travelMode ?? "unknown";
  const apiMode = TRAVEL_MODE_TO_API[mode];
  const body: Record<string, unknown> = {
    origin: waypointBody(origin),
    destination: waypointBody(destination),
    intermediates: intermediates.map((stop) => ({
      ...waypointBody(stop),
      ...(stop.via ? { via: true } : {}),
    })),
    travelMode: apiMode,
    languageCode: "en-US",
    units: "METRIC",
    polylineEncoding: "ENCODED_POLYLINE",
  };

  const driveLike = apiMode === "DRIVE" || apiMode === "TWO_WHEELER";
  if (driveLike) {
    body.routingPreference = "TRAFFIC_UNAWARE";
  }
  // Routes API does not return alternatives when intermediate waypoints are set.
  // https://developers.google.com/maps/documentation/routes/compute_route_directions
  if (driveLike && intermediates.length === 0) {
    body.computeAlternativeRoutes = true;
  }

  const warnings: string[] = [];
  if (mode === "unknown") {
    warnings.push("Travel mode was missing, so the request uses DRIVE.");
  }
  if (driveLike && intermediates.length > 0) {
    warnings.push(
      "Intermediate waypoints are set, so alternative routes were not requested.",
    );
  }
  const modifiers = routeModifiers(parsed);
  if (driveLike && Object.keys(modifiers).length > 0) {
    body.routeModifiers = modifiers;
  }
  if (!driveLike) {
    const blocked = (["tolls", "highways", "ferries"] as const).filter(
      (flag) => parsed.avoid[flag] === true,
    );
    if (blocked.length > 0) {
      warnings.push(
        `Avoid ${blocked.join(", ")} was recovered, but routeModifiers are not sent for ${apiMode}.`,
      );
    }
  }
  const paired = [origin, destination, ...intermediates].filter(
    (stop) => stop.location && stop.placeId,
  );
  if (paired.length > 0) {
    warnings.push(
      `${paired.length} stop(s) have coordinates and a place ID. The Routes request uses the coordinates. The place ID stays on the draft and on the rebuilt URL.`,
    );
  }
  return { body, warning: warnings.length > 0 ? warnings.join(" ") : null };
}

function routeModifiers(parsed: ParsedMapsUrl): Record<string, boolean> {
  const modifiers: Record<string, boolean> = {};
  if (parsed.avoid.tolls === true) {
    modifiers.avoidTolls = true;
  }
  if (parsed.avoid.highways === true) {
    modifiers.avoidHighways = true;
  }
  if (parsed.avoid.ferries === true) {
    modifiers.avoidFerries = true;
  }
  return modifiers;
}

export async function computeGoogleRoutes(
  parsed: ParsedMapsUrl,
  options: {
    config: GoogleApiConfig;
    fetchImpl?: typeof fetch;
    budgetStore?: LiveBudgetStore;
    /**
     * Count this call against the local cap. Defaults to real server calls
     * outside Vitest. Mocked fetches in the default test suite do not count.
     */
    countLiveRequest?: boolean;
  },
): Promise<ReconstructionResult> {
  const status = googleApiStatus(options.config);
  if (!status.liveAvailable) {
    return {
      ...emptyLiveResult(status),
      googleApi: {
        attempted: false,
        enabled: status.enabled,
        configured: status.configured,
        error: status.reason,
      },
    };
  }

  const countsTowardCap =
    options.countLiveRequest ??
    (!options.fetchImpl && process.env.VITEST !== "true");
  if (countsTowardCap) {
    const reservation = reserveLiveCall("computeRoutes", options.budgetStore);
    if (!reservation.allowed) {
      return failedLive(
        status,
        reservation.reason ?? "Local computeRoutes cap reached.",
      );
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const { body, warning } = buildRoutesRequest(parsed);
  let response: Response;
  try {
    response = await fetchImpl(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": options.config.apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
  } catch {
    return failedLive(
      status,
      "The request to routes.googleapis.com failed before a response arrived.",
    );
  }

  const text = await response.text();
  const redacted = redactSecrets(text, options.config.apiKey);
  let payload: unknown;
  try {
    payload = redacted ? JSON.parse(redacted) : null;
  } catch {
    return failedLive(
      status,
      `Google Routes returned a non-JSON response (${response.status}).`,
    );
  }

  if (!response.ok) {
    const message = describeGoogleFailure(
      response.status,
      readGoogleError(payload) ?? `Google Routes returned HTTP ${response.status}.`,
    );
    return failedLive(status, message);
  }

  const routes = readRoutes(payload);
  if (warning) {
    for (const route of routes) {
      route.description = `${route.description} ${warning}`.trim();
    }
  }

  const fidelity = diagnoseFidelity(parsed, routes, "google_routes_api");
  const mapStops = parsed.stops.flatMap((stop) => {
    if (!stop.location) {
      return [];
    }
    return [
      {
        label: stop.label ?? formatCoordinate(stop.location),
        role: stop.role,
        location: stop.location,
      },
    ];
  });

  return {
    source: "google_routes_api",
    mock: false,
    label: "LIVE — Google Routes API",
    disclaimer:
      "Computed just now by the Google Routes API from the recovered stops. This is a new route, not a replay of the alternative that was selected when the link was shared, and it is not mock data.",
    geometryProvenance:
      routes.some((route) => route.encodedPolyline) ? "google_routes_polyline" : "none",
    provenanceNote:
      "Polylines in this result were returned by Google Routes. They are still not evidence that the shared selection was preserved.",
    routes,
    sourcePolyline: parsed.encodedPolyline
      ? {
          encodedPolyline: parsed.encodedPolyline,
          note: "Polyline copied from the URL, separate from the Routes API alternatives.",
        }
      : null,
    mapStops,
    fidelity,
    googleApi: {
      attempted: true,
      enabled: true,
      configured: true,
      error: routes.length === 0 ? "Google Routes returned no routes." : null,
    },
  };
}

function waypointBody(stop: RouteStop): Record<string, unknown> {
  if (stop.location) {
    return { location: { latLng: latLng(stop.location) } };
  }
  if (stop.placeId) {
    return { placeId: stop.placeId };
  }
  return { address: stop.label ?? "" };
}

function latLng(point: GeoPoint): { latitude: number; longitude: number } {
  return { latitude: point.latitude, longitude: point.longitude };
}

function readRoutes(payload: unknown): ReconstructedRoute[] {
  if (!payload || typeof payload !== "object" || !("routes" in payload)) {
    return [];
  }
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes)) {
    return [];
  }
  return routes.map((route, index) => {
    const record = asRecord(route);
    const polyline = asRecord(record.polyline);
    const labels = Array.isArray(record.routeLabels)
      ? record.routeLabels.filter((label): label is string => typeof label === "string")
      : [];
    const warnings = Array.isArray(record.warnings)
      ? record.warnings.filter((warning): warning is string => typeof warning === "string")
      : [];
    const description = [
      typeof record.description === "string" ? record.description : "",
      labels.length > 0 ? `Labels: ${labels.join(", ")}.` : "",
      warnings.length > 0 ? `Warnings: ${warnings.join(" ")}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      id: `google-${index + 1}`,
      label: labels.includes("DEFAULT_ROUTE")
        ? "Google default route"
        : `Google alternative ${index + 1}`,
      source: "google_routes_api" as const,
      synthetic: false,
      encodedPolyline:
        typeof polyline.encodedPolyline === "string"
          ? polyline.encodedPolyline
          : null,
      distanceMeters:
        typeof record.distanceMeters === "number" ? record.distanceMeters : null,
      durationSeconds: parseDuration(
        typeof record.duration === "string" ? record.duration : null,
      ),
      description: description || "Route returned by the Google Routes API.",
      isDefaultAlternative: labels.includes("DEFAULT_ROUTE") || index === 0,
    };
  });
}

function parseDuration(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (!match) {
    return null;
  }
  return Math.round(Number(match[1]));
}

function readGoogleError(payload: unknown): string | null {
  const record = asRecord(payload);
  const error = asRecord(record.error);
  return typeof error.message === "string" ? error.message : null;
}

function describeGoogleFailure(httpStatus: number, message: string): string {
  const normalized = message.toLowerCase();
  if (httpStatus === 429 || normalized.includes("quota")) {
    return `Google Routes quota error: ${message}`;
  }
  if (
    normalized.includes("billing") ||
    normalized.includes("permission_denied") ||
    httpStatus === 403
  ) {
    return `Google Routes billing or permission error: ${message}`;
  }
  return message;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

function redactSecrets(text: string, apiKey: string): string {
  if (!apiKey) {
    return text;
  }
  return text.split(apiKey).join("[redacted]");
}

function emptyLiveResult(status: GoogleApiStatus): ReconstructionResult {
  return {
    source: "google_routes_api",
    mock: false,
    label: "LIVE — Google Routes API",
    disclaimer: status.reason,
    geometryProvenance: "none",
    provenanceNote: null,
    routes: [],
    sourcePolyline: null,
    mapStops: [],
    fidelity: {
      verdict: "insufficient_stops",
      selectedRoutePreserved: false,
      headline: "Google Routes was not called.",
      reasons: [status.reason],
      comparison: {
        stopsRecovered: 0,
        coordinatesRecovered: 0,
        polylineInSource: false,
        routeTokenInSource: false,
        alternativeCount: 0,
        alternativesAreDistinctGeometries: false,
      },
    },
    googleApi: {
      attempted: false,
      enabled: status.enabled,
      configured: status.configured,
      error: status.reason,
    },
  };
}

function failedLive(status: GoogleApiStatus, error: string): ReconstructionResult {
  const base = emptyLiveResult(status);
  return {
    ...base,
    disclaimer: error,
    fidelity: {
      ...base.fidelity,
      headline: "The Google Routes API call failed. No route was reconstructed.",
      reasons: [error],
    },
    googleApi: {
      attempted: true,
      enabled: status.enabled,
      configured: status.configured,
      error,
    },
  };
}

export { redactSecrets };
