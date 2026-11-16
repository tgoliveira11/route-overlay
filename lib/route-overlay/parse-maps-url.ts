import {
  MAX_SHORT_LINK_REDIRECTS,
  defaultResolveHost,
  isAllowlistedMapsHost,
  isFullMapsUrl,
  isIpLiteral,
  isNonPublicAddress,
  isShortLinkUrl,
  type HostResolver,
} from "@/lib/route-overlay/redirect-policy";
import type {
  AvoidFlags,
  GeoPoint,
  ParsedMapsUrl,
  RouteStop,
  StopRole,
  StopSource,
  TravelMode,
} from "@/lib/route-overlay/types";

const COORDINATE_PAIR = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

const PLACE_ID =
  /^(?:0x[0-9a-f]+:0x[0-9a-f]+|ChIJ[\w-]+)$/i;

/**
 * Observed `!3eN` values in Google Maps directions URLs.
 * This is not a documented Maps URLs API contract. Callers must treat it as partial evidence.
 */
const DATA_BLOB_TRAVEL_MODES: Record<number, TravelMode> = {
  0: "driving",
  1: "bicycling",
  2: "walking",
  3: "transit",
  4: "two_wheeler",
};

interface DataToken {
  key: number;
  type: string;
  value: string;
}

interface BlobExtract {
  coordinates: GeoPoint[];
  placeIds: string[];
  travelMode: TravelMode | null;
  travelModeToken: string | null;
  integers: number[];
  /** Enum and long-integer tokens other than the travel-mode enum that was adopted. */
  uninterpreted: string[];
  ignoredStrings: number;
}

const EMPTY_AVOID: AvoidFlags = {
  tolls: null,
  highways: null,
  ferries: null,
};

/**
 * Parse a Google Maps directions URL without any network access.
 * Short links are classified and left for `expandShortLink`.
 */
export function parseMapsUrl(input: string): ParsedMapsUrl {
  const trimmed = input.trim();
  const base = emptyParsed(trimmed);

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    base.kind = "invalid";
    base.warnings.push("The text is not an absolute URL.");
    return base;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    base.kind = "invalid";
    base.warnings.push("Only http and https URLs can be parsed.");
    return base;
  }

  base.normalizedUrl = url.toString();

  if (isShortLinkUrl(url)) {
    base.kind = "short_link";
    base.shortLink = true;
    base.warnings.push(
      "Short links hide the directions fields behind an HTTP redirect. They cannot be parsed offline.",
    );
    return base;
  }

  if (!isAllowlistedMapsHost(url.hostname)) {
    base.kind = "invalid";
    base.warnings.push(
      "The host is not a Google Maps host. RouteOverlay only parses maps.google.com, google.com/maps, and the public short-link hosts.",
    );
    return base;
  }

  const params = url.searchParams;
  const legacy = hasLegacyDirections(params);
  const queryDirections = hasQueryDirections(params);
  const pathDirections = url.pathname.includes("/maps/dir");

  if (!legacy && !queryDirections && !pathDirections) {
    base.kind = "unsupported";
    base.warnings.push(
      "This Google Maps URL is not a directions link. Place and search links do not describe a route.",
    );
    return base;
  }

  if (legacy) {
    applyLegacy(base, params);
  } else if (queryDirections) {
    applyQueryDirections(base, params);
  } else {
    applyPathDirections(base, url);
  }

  applySharedQueryHints(base, params);
  applyDataBlob(base, url);
  base.viewport = readViewport(url.pathname);
  return base;
}

export interface ShortLinkExpandOptions {
  resolveHost?: HostResolver;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export async function expandShortLink(
  input: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
  options: ShortLinkExpandOptions = {},
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return { ok: false, error: "The short link is not a valid URL." };
  }

  if (!isShortLinkUrl(parsed)) {
    return {
      ok: false,
      error:
        "Refusing to fetch this host. Only https://maps.app.goo.gl and https://goo.gl/maps links are expanded.",
    };
  }
  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Short links must use https." };
  }

  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let requestUrl = parsed;
    let followed = 0;
    for (;;) {
      const ready = await validateBeforeFetch(requestUrl, resolveHost);
      if (!ready.ok) {
        return ready;
      }
      const response = await fetchImpl(ready.url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: {
          Accept: "text/html",
          "User-Agent": "RouteOverlayPoC/0.1 (local feasibility study)",
        },
      });
      const location = redirectLocation(response);
      await discardBody(response);
      if (location !== null && REDIRECT_STATUSES.has(response.status)) {
        followed += 1;
        if (followed > MAX_SHORT_LINK_REDIRECTS) {
          return {
            ok: false,
            error:
              "The short link exceeded the redirect limit before it reached a Google Maps URL.",
          };
        }
        let next: URL;
        try {
          next = new URL(location, ready.url);
        } catch {
          return { ok: false, error: "The redirect target was not a valid URL." };
        }
        requestUrl = next;
        continue;
      }
      if (!isFullMapsUrl(ready.url)) {
        return {
          ok: false,
          error: "The short link did not expand to a full Google Maps URL.",
        };
      }
      return { ok: true, url: ready.url.toString() };
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      error: aborted
        ? "Expanding the short link timed out. The stops cannot be read offline."
        : "Expanding the short link failed. The stops cannot be read offline.",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function validateBeforeFetch(
  input: URL,
  resolveHost: HostResolver,
): Promise<{ ok: true; url: URL } | { ok: false; error: string }> {
  const prepared = prepareRequestUrl(input);
  if (!prepared.ok) {
    return prepared;
  }
  const hostname = prepared.url.hostname;
  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    return {
      ok: false,
      error: `The host ${hostname} could not be resolved and was not requested.`,
    };
  }
  if (
    addresses.length === 0 ||
    addresses.some((address) => isNonPublicAddress(address))
  ) {
    return {
      ok: false,
      error: `The host ${hostname} resolves to a private or local address and was not requested.`,
    };
  }
  return prepared;
}

function prepareRequestUrl(
  input: URL,
): { ok: true; url: URL } | { ok: false; error: string } {
  const url = new URL(input.toString());
  if (url.protocol !== "https:") {
    return { ok: false, error: "Short links must use https." };
  }
  if (url.username || url.password) {
    return rejectedTarget(url.hostname);
  }
  if (url.port) {
    return rejectedTarget(url.hostname);
  }
  let hostname = url.hostname.toLowerCase();
  if (hostname.endsWith(".")) {
    hostname = hostname.slice(0, -1);
    url.hostname = hostname;
  }
  if (isIpLiteral(hostname) || !isAllowlistedMapsHost(hostname)) {
    return rejectedTarget(hostname);
  }
  if (!isShortLinkUrl(url) && !isFullMapsUrl(url)) {
    return rejectedTarget(hostname);
  }
  return { ok: true, url };
}

function rejectedTarget(hostname: string): { ok: false; error: string } {
  const label = hostname || "the redirect target";
  return {
    ok: false,
    error: `The redirect target ${label} was rejected before it was requested.`,
  };
}

function redirectLocation(response: Response): string | null {
  if (!response.headers || typeof response.headers.get !== "function") {
    return null;
  }
  const location = response.headers.get("location");
  if (!location) {
    return null;
  }
  const trimmed = location.trim();
  return trimmed || null;
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The caller only needs the status and Location header.
  }
}

function emptyParsed(input: string): ParsedMapsUrl {
  return {
    inputUrl: input,
    normalizedUrl: input,
    kind: "invalid",
    shortLink: false,
    expandedFrom: null,
    travelMode: null,
    travelModeEvidence: null,
    travelModeDocumented: false,
    stops: [],
    viewport: null,
    encodedPolyline: null,
    polylineFromExtension: false,
    routeToken: null,
    departureTime: null,
    avoid: { ...EMPTY_AVOID },
    avoidDocumented: false,
    undocumentedIntegers: [],
    uninterpretedBlobFields: [],
    warnings: [],
  };
}

function hasQueryDirections(params: URLSearchParams): boolean {
  return (
    params.has("origin") ||
    params.has("destination") ||
    params.get("api") === "1"
  );
}

function hasLegacyDirections(params: URLSearchParams): boolean {
  return params.has("saddr") || params.has("daddr");
}

function applyQueryDirections(parsed: ParsedMapsUrl, params: URLSearchParams): void {
  parsed.kind = "maps_url_api";
  const origin = params.get("origin");
  const destination = params.get("destination");
  const waypoints = splitList(params.get("waypoints"));
  const labels: { raw: string; role: StopRole }[] = [];
  if (origin) {
    labels.push({ raw: origin, role: "origin" });
  }
  for (const raw of waypoints) {
    labels.push({ raw, role: "waypoint" });
  }
  if (destination) {
    labels.push({ raw: destination, role: "destination" });
  }

  parsed.stops = labels.map((item) => stopFromText(item.raw, item.role, "query"));

  const originPlaceId = params.get("origin_place_id");
  const destinationPlaceId = params.get("destination_place_id");
  const waypointPlaceIds = splitAligned(params.get("waypoint_place_ids"));
  assignPlaceId(parsed.stops, "origin", originPlaceId);
  assignPlaceId(parsed.stops, "destination", destinationPlaceId);
  const middle = parsed.stops.filter(
    (stop) => stop.role === "waypoint" || stop.role === "via",
  );
  middle.forEach((stop, index) => {
    if (waypointPlaceIds[index]) {
      stop.placeId = waypointPlaceIds[index];
    }
  });

  const travelMode = params.get("travelmode");
  if (travelMode) {
    const mapped = mapDocumentedTravelMode(travelMode);
    parsed.travelMode = mapped;
    parsed.travelModeDocumented = true;
    parsed.travelModeEvidence = `Query parameter travelmode=${travelMode}.`;
    if (mapped === "unknown") {
      parsed.warnings.push(
        `travelmode=${travelMode} is not one of driving, walking, bicycling, transit, or two-wheeler.`,
      );
    }
  }

  if (!origin || !destination) {
    parsed.warnings.push(
      "The Maps URLs API link is missing an origin, a destination, or both.",
    );
  }
}

function applyLegacy(parsed: ParsedMapsUrl, params: URLSearchParams): void {
  parsed.kind = "legacy";
  const origin = params.get("saddr");
  const daddr = params.get("daddr") ?? "";
  // Query decoding turns the legacy "+to:" separator into " to:".
  const parts = daddr
    .split(/\+to:|\s+to:/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const stops: RouteStop[] = [];
  if (origin) {
    stops.push(stopFromText(origin, "origin", "legacy"));
  }
  parts.forEach((part, index) => {
    const role: StopRole = index === parts.length - 1 ? "destination" : "waypoint";
    stops.push(stopFromText(part, role, "legacy"));
  });
  parsed.stops = stops;

  const dirflg = params.get("dirflg");
  if (dirflg) {
    const parsedFlags = parseDirflg(dirflg);
    if (parsedFlags.mode) {
      parsed.travelMode = parsedFlags.mode;
      parsed.travelModeDocumented = true;
      parsed.travelModeEvidence = `Legacy dirflg=${dirflg}.`;
    }
    if (parsedFlags.avoidHighways) {
      parsed.avoid.highways = true;
    }
    if (parsedFlags.avoidTolls) {
      parsed.avoid.tolls = true;
    }
  }

  if (!origin || parts.length === 0) {
    parsed.warnings.push("The legacy saddr/daddr link is missing an endpoint.");
  }
}

function applyPathDirections(parsed: ParsedMapsUrl, url: URL): void {
  parsed.kind = "directions_path";
  const marker = "/maps/dir";
  const index = url.pathname.indexOf(marker);
  let rest = url.pathname.slice(index + marker.length);
  if (rest.startsWith("/")) {
    rest = rest.slice(1);
  }

  const segments: { label: string | null; location: GeoPoint | null }[] = [];
  for (const segment of rest.split("/")) {
    if (!segment) {
      continue;
    }
    const decoded = safeDecode(segment);
    if (
      decoded.startsWith("@") ||
      decoded.startsWith("data=") ||
      decoded.startsWith("am=")
    ) {
      continue;
    }
    const label = cleanLabel(decoded);
    if (!label) {
      continue;
    }
    const location = parseCoordinatePair(label);
    segments.push({
      label: location ? null : label,
      location,
    });
  }

  parsed.stops = segments.map((segment, stopIndex) => {
    const role = roleForIndex(stopIndex, segments.length);
    return {
      role,
      label: segment.label,
      placeId: null,
      location: segment.location,
      via: false,
      source: "path" as const,
    };
  });

  if (segments.length < 2) {
    parsed.warnings.push(
      "The directions path does not contain both an origin and a destination.",
    );
  }
}

function applySharedQueryHints(
  parsed: ParsedMapsUrl,
  params: URLSearchParams,
): void {
  if (!parsed.travelMode && params.get("travelmode")) {
    const travelMode = params.get("travelmode") ?? "";
    parsed.travelMode = mapDocumentedTravelMode(travelMode);
    parsed.travelModeDocumented = true;
    parsed.travelModeEvidence = `Query parameter travelmode=${travelMode}.`;
  }

  const avoid = params.get("avoid");
  if (avoid) {
    const flags = avoid.toLowerCase().split(/[|,]/).map((item) => item.trim());
    if (flags.includes("tolls")) {
      parsed.avoid.tolls = true;
    }
    if (flags.includes("highways")) {
      parsed.avoid.highways = true;
    }
    if (flags.includes("ferries")) {
      parsed.avoid.ferries = true;
    }
    parsed.avoidDocumented = true;
  }

  const polyline = params.get("polyline");
  if (polyline) {
    parsed.encodedPolyline = polyline;
    parsed.polylineFromExtension = true;
    parsed.warnings.push(
      "A polyline query parameter was present. Standard Google Maps share links do not include one. It is recognized so an explicit geometry can be compared.",
    );
  }

  const routeToken = params.get("route_token");
  if (routeToken) {
    parsed.routeToken = routeToken;
    parsed.warnings.push(
      "A route_token query parameter was present. Public share links do not carry the Routes API route token.",
    );
  }

  const departure = params.get("departure_time");
  if (departure) {
    parsed.departureTime = departure;
  }
}

function applyDataBlob(parsed: ParsedMapsUrl, url: URL): void {
  const blob = extractDataBlob(url.href);
  if (!blob) {
    return;
  }
  const extracted = readDataBlob(blob);
  parsed.undocumentedIntegers = extracted.integers;
  parsed.uninterpretedBlobFields = extracted.uninterpreted;

  if (extracted.coordinates.length > 0) {
    attachBlobCoordinates(parsed, extracted.coordinates);
  }

  if (extracted.placeIds.length > 0) {
    const missing = parsed.stops.filter((stop) => !stop.placeId);
    if (missing.length === extracted.placeIds.length) {
      missing.forEach((stop, index) => {
        stop.placeId = extracted.placeIds[index];
      });
    } else if (parsed.stops.length === extracted.placeIds.length) {
      parsed.stops.forEach((stop, index) => {
        if (!stop.placeId) {
          stop.placeId = extracted.placeIds[index];
        }
      });
    }
  }

  if (!parsed.travelMode && extracted.travelMode && extracted.travelModeToken) {
    parsed.travelMode = extracted.travelMode;
    parsed.travelModeDocumented = false;
    parsed.travelModeEvidence = `Data-blob enum ${extracted.travelModeToken}. This mapping is observed in Maps URLs and is not a documented Google contract.`;
  }

  if (extracted.ignoredStrings > 0 && parsed.stops.every((stop) => stop.label)) {
    parsed.warnings.push(
      `The data blob contained ${extracted.ignoredStrings} text field${extracted.ignoredStrings === 1 ? "" : "s"} that were not used as stop names.`,
    );
  }
}

function extractDataBlob(href: string): string | null {
  const decoded = safeDecode(href);
  const match = decoded.match(/data=!([^?#"\s]+)/);
  if (!match) {
    return null;
  }
  return `!${match[1]}`;
}

function readDataBlob(blob: string): BlobExtract {
  const tokens = tokenize(blob);
  const coordinates: GeoPoint[] = [];
  const placeIds: string[] = [];
  const integers: number[] = [];
  const enums: string[] = [];
  const longs: string[] = [];
  let ignoredStrings = 0;
  let travelMode: TravelMode | null = null;
  let travelModeToken: string | null = null;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const next = tokens[index + 1];
    if (
      token.type === "d" &&
      token.key === 1 &&
      next &&
      next.type === "d" &&
      next.key === 2
    ) {
      const point = pointFromLngLat(token.value, next.value);
      if (point) {
        coordinates.push(point);
      }
      index += 1;
      continue;
    }
    if (token.type === "s") {
      if (PLACE_ID.test(token.value)) {
        placeIds.push(token.value);
      } else if (token.value.trim()) {
        ignoredStrings += 1;
      }
    }
    if (token.type === "e") {
      const tokenText = `!${token.key}e${token.value}`;
      enums.push(tokenText);
      if (token.key === 3) {
        const enumValue = Number(token.value);
        if (Number.isInteger(enumValue) && enumValue in DATA_BLOB_TRAVEL_MODES) {
          travelMode = DATA_BLOB_TRAVEL_MODES[enumValue];
          travelModeToken = tokenText;
        }
      }
    }
    if (token.type === "i") {
      const integer = Number(token.value);
      if (Number.isFinite(integer)) {
        integers.push(integer);
      }
    }
    if (token.type === "j" && token.value) {
      longs.push(`!${token.key}j${token.value}`);
    }
  }

  return {
    coordinates,
    placeIds,
    travelMode,
    travelModeToken,
    integers,
    uninterpreted: [
      ...enums.filter((tokenText) => tokenText !== travelModeToken),
      ...longs,
    ],
    ignoredStrings,
  };
}

function tokenize(blob: string): DataToken[] {
  return blob
    .split("!")
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(\d+)([a-z])(.*)$/i);
      if (!match) {
        return [];
      }
      return [
        {
          key: Number(match[1]),
          type: match[2].toLowerCase(),
          value: match[3],
        },
      ];
    });
}

function attachBlobCoordinates(parsed: ParsedMapsUrl, coordinates: GeoPoint[]): void {
  if (parsed.stops.length === 0) {
    parsed.stops = coordinates.map((location, index) => ({
      role: roleForIndex(index, coordinates.length),
      label: null,
      placeId: null,
      location,
      via: false,
      source: "data_blob" as const,
    }));
    return;
  }

  const missing = parsed.stops.filter((stop) => !stop.location);
  if (missing.length === 0) {
    parsed.warnings.push(
      "Stops already had coordinates, so coordinates in the data blob were not copied onto them.",
    );
    return;
  }

  if (coordinates.length === parsed.stops.length) {
    parsed.stops.forEach((stop, index) => {
      if (!stop.location) {
        stop.location = coordinates[index];
        if (stop.source === "path") {
          stop.source = "merged";
        }
      }
    });
    return;
  }

  if (coordinates.length === missing.length) {
    missing.forEach((stop, index) => {
      stop.location = coordinates[index];
      if (stop.source === "path") {
        stop.source = "merged";
      }
    });
    return;
  }

  const count = Math.min(parsed.stops.length, coordinates.length);
  for (let index = 0; index < count; index += 1) {
    if (!parsed.stops[index].location) {
      parsed.stops[index].location = coordinates[index];
      if (parsed.stops[index].source === "path") {
        parsed.stops[index].source = "merged";
      }
    }
  }
  parsed.warnings.push(
    "Coordinate count does not match the number of stop names. Coordinates were attached in order until one list ran out.",
  );
}

function pointFromLngLat(longitudeText: string, latitudeText: string): GeoPoint | null {
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  return validPoint(latitude, longitude);
}

function stopFromText(
  raw: string,
  role: StopRole,
  source: StopSource,
): RouteStop {
  let text = cleanLabel(raw);
  let via = false;
  if (/^via:/i.test(text)) {
    via = true;
    text = text.slice(4).trim();
  }
  const resolvedRole: StopRole =
    via && (role === "waypoint" || role === "via") ? "via" : role;
  if (/^place_id:/i.test(text)) {
    return {
      role: resolvedRole,
      label: null,
      placeId: text.slice("place_id:".length).trim() || null,
      location: null,
      via,
      source,
    };
  }
  const location = parseCoordinatePair(text);
  return {
    role: resolvedRole,
    label: location ? null : text || null,
    placeId: null,
    location,
    via,
    source,
  };
}

function parseCoordinatePair(text: string): GeoPoint | null {
  const match = COORDINATE_PAIR.exec(text);
  if (!match) {
    return null;
  }
  return validPoint(Number(match[1]), Number(match[2]));
}

function validPoint(latitude: number, longitude: number): GeoPoint | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

function assignPlaceId(
  stops: RouteStop[],
  role: StopRole,
  placeId: string | null,
): void {
  if (!placeId) {
    return;
  }
  const stop = stops.find((item) => item.role === role);
  if (stop) {
    stop.placeId = placeId;
  }
}

function splitAligned(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value.split("|").map((item) => item.trim());
}

function splitList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  return value
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapDocumentedTravelMode(value: string): TravelMode {
  switch (value.trim().toLowerCase()) {
    case "driving":
      return "driving";
    case "walking":
      return "walking";
    case "bicycling":
      return "bicycling";
    case "transit":
      return "transit";
    case "two-wheeler":
    case "two_wheeler":
      return "two_wheeler";
    default:
      return "unknown";
  }
}

function parseDirflg(value: string): {
  mode: TravelMode | null;
  avoidHighways: boolean;
  avoidTolls: boolean;
} {
  let mode: TravelMode | null = null;
  for (const char of value.toLowerCase()) {
    if (char === "d") {
      mode = "driving";
      break;
    }
    if (char === "w") {
      mode = "walking";
      break;
    }
    if (char === "b") {
      mode = "bicycling";
      break;
    }
    if (char === "r") {
      mode = "transit";
      break;
    }
  }
  const flags = value.toLowerCase();
  return {
    mode,
    avoidHighways: flags.includes("h"),
    avoidTolls: flags.includes("t"),
  };
}

function readViewport(pathname: string): ParsedMapsUrl["viewport"] {
  const decoded = safeDecode(pathname);
  const match = decoded.match(
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/,
  );
  if (!match) {
    return null;
  }
  const center = validPoint(Number(match[1]), Number(match[2]));
  if (!center) {
    return null;
  }
  return {
    center,
    zoom: match[3] ? Number(match[3]) : null,
  };
}

function roleForIndex(index: number, count: number): StopRole {
  if (index === 0) {
    return "origin";
  }
  if (index === count - 1) {
    return "destination";
  }
  return "waypoint";
}

function cleanLabel(value: string): string {
  return safeDecode(value).replace(/\+/g, " ").replace(/\s+/g, " ").trim();
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

