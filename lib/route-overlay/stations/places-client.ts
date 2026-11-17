import { reservePhase5Call, type Phase5BudgetStore } from "@/lib/route-overlay/stations/budget";
import { interpretOpeningHours, type HoursSnapshot } from "@/lib/route-overlay/stations/hours";
import type { PlaceCandidate } from "@/lib/route-overlay/stations/places-match";

/**
 * One Text Search (New) request. regularOpeningHours and currentOpeningHours
 * select the Enterprise SKU. Atmosphere and fuel fields are not requested.
 * https://developers.google.com/maps/documentation/places/web-service/text-search
 */
export const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.currentOpeningHours",
].join(",");

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

export interface PlacesLookup {
  candidate: PlaceCandidate | null;
  regularHours: HoursSnapshot | null;
  currentHours: HoursSnapshot | null;
  requestSent: boolean;
  error: string | null;
}

export async function lookupStationPlace(
  input: { textQuery: string; apiKey: string },
  store: Phase5BudgetStore,
  fetchImpl: typeof fetch = fetch,
): Promise<PlacesLookup> {
  const reservation = reservePhase5Call("placesRequests", store);
  if (!reservation.allowed) {
    return {
      candidate: null,
      regularHours: null,
      currentHours: null,
      requestSent: false,
      error: reservation.reason,
    };
  }
  let response: Response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": input.apiKey,
        "X-Goog-FieldMask": PLACES_FIELD_MASK,
      },
      body: JSON.stringify({
        textQuery: input.textQuery,
        pageSize: 1,
        regionCode: "BR",
      }),
    });
  } catch (error) {
    return failed(redact(error instanceof Error ? error.message : "Places request failed", input.apiKey));
  }
  const bodyText = await response.text();
  if (response.status === 429) {
    return failed("Places quota or rate limit. No retry was sent.");
  }
  if (!response.ok) {
    return failed(redact(`Places HTTP ${response.status}: ${bodyText.slice(0, 180)}`, input.apiKey));
  }
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText) as unknown;
  } catch {
    return failed("Places response was not JSON.");
  }
  const places = payload && typeof payload === "object" && Array.isArray((payload as { places?: unknown }).places)
    ? (payload as { places: unknown[] }).places
    : [];
  const first = places[0];
  if (!first || typeof first !== "object") {
    return { candidate: null, regularHours: null, currentHours: null, requestSent: true, error: null };
  }
  const record = first as Record<string, unknown>;
  const location = record.location && typeof record.location === "object"
    ? (record.location as { latitude?: unknown; longitude?: unknown })
    : null;
  const latitude = typeof location?.latitude === "number" ? location.latitude : null;
  const longitude = typeof location?.longitude === "number" ? location.longitude : null;
  const displayName = record.displayName && typeof record.displayName === "object"
    ? (record.displayName as { text?: unknown }).text
    : null;
  return {
    candidate: {
      id: typeof record.id === "string" ? record.id : "",
      name: typeof displayName === "string" ? displayName : "",
      formattedAddress: typeof record.formattedAddress === "string" ? record.formattedAddress : "",
      location: latitude !== null && longitude !== null ? { latitude, longitude } : null,
      businessStatus: typeof record.businessStatus === "string" ? record.businessStatus : null,
    },
    regularHours: interpretOpeningHours(record.regularOpeningHours, "google_regular"),
    currentHours: interpretOpeningHours(record.currentOpeningHours, "google_current"),
    requestSent: true,
    error: null,
  };
}

function failed(error: string): PlacesLookup {
  return { candidate: null, regularHours: null, currentHours: null, requestSent: true, error };
}

export function redact(value: string, secret: string): string {
  if (!secret) {
    return value;
  }
  return value.split(secret).join("[redacted]");
}
