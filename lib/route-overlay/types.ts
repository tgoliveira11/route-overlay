/**
 * Domain types for the route-import feasibility proof of concept.
 * Nothing in this module talks to Google.
 */

export type TravelMode =
  | "driving"
  | "walking"
  | "bicycling"
  | "transit"
  | "two_wheeler"
  | "unknown";

/** How confidently a field was recovered from the shared URL. */
export type FieldStatus =
  | "recovered"
  | "partial"
  | "missing"
  | "not_encoded"
  | "inconclusive";

export type StopRole = "origin" | "waypoint" | "via" | "destination";

export type StopSource = "query" | "path" | "data_blob" | "legacy" | "merged";

export type MapsUrlKind =
  | "maps_url_api"
  | "directions_path"
  | "legacy"
  | "short_link"
  | "unsupported"
  | "invalid";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface RouteStop {
  role: StopRole;
  /** Place name when the URL carried text. Null when the URL carried only coordinates or a place id. */
  label: string | null;
  placeId: string | null;
  location: GeoPoint | null;
  /** True when the stop is a pass-through rather than a stopover. */
  via: boolean;
  source: StopSource;
}

export interface AvoidFlags {
  tolls: boolean | null;
  highways: boolean | null;
  ferries: boolean | null;
}

export interface ParsedMapsUrl {
  inputUrl: string;
  normalizedUrl: string;
  kind: MapsUrlKind;
  shortLink: boolean;
  /** The short link that was expanded, when expansion succeeded. */
  expandedFrom: string | null;
  travelMode: TravelMode | null;
  /** Human-readable evidence for the travel-mode value, including the raw token. */
  travelModeEvidence: string | null;
  /** True when travel mode came from a documented parameter rather than the data blob. */
  travelModeDocumented: boolean;
  stops: RouteStop[];
  viewport: { center: GeoPoint; zoom: number | null } | null;
  encodedPolyline: string | null;
  /** True only for the explicit `polyline` query this parser accepts. Share links do not set it. */
  polylineFromExtension: boolean;
  routeToken: string | null;
  departureTime: string | null;
  avoid: AvoidFlags;
  /** True when avoid flags came from the documented Maps URLs `avoid` parameter. */
  avoidDocumented: boolean;
  /** Integer fields found in the data blob. They are not treated as a selected-route index. */
  undocumentedIntegers: number[];
  /**
   * Other data-blob fields with no Maps URLs meaning assigned by this parser.
   * Includes enums other than the adopted travel-mode token, and `j` long integers.
   */
  uninterpretedBlobFields: string[];
  warnings: string[];
}

export interface RecoverabilityItem {
  id: string;
  field: string;
  status: FieldStatus;
  detail: string;
}

export interface RecoverabilityReport {
  items: RecoverabilityItem[];
  canReconstructStops: boolean;
  /** The selected alternative's geometry is in the URL itself. */
  geometryPresentInUrl: boolean;
  summary: string;
}

export type ReconstructionSource = "mock" | "google_routes_api";

export type GeometryProvenance =
  | "none"
  | "synthetic_from_url_coordinates"
  | "synthetic_from_local_sample_fixture"
  | "google_routes_polyline";

export interface ReconstructedRoute {
  id: string;
  label: string;
  source: ReconstructionSource;
  /** True when the geometry was fabricated on this machine. */
  synthetic: boolean;
  encodedPolyline: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  description: string;
  /** True for the first alternative a provider would present as its default. */
  isDefaultAlternative: boolean;
}

export type FidelityVerdict =
  | "not_preserved"
  | "constrained_not_proven"
  | "insufficient_stops"
  | "polyline_in_url";

export interface FidelityComparison {
  stopsRecovered: number;
  coordinatesRecovered: number;
  polylineInSource: boolean;
  routeTokenInSource: boolean;
  alternativeCount: number;
  alternativesAreDistinctGeometries: boolean;
}

export interface FidelityDiagnostic {
  verdict: FidelityVerdict;
  selectedRoutePreserved: boolean;
  headline: string;
  reasons: string[];
  comparison: FidelityComparison;
}

export interface MapStop {
  label: string;
  role: StopRole;
  location: GeoPoint;
}

export interface ReconstructionResult {
  source: ReconstructionSource;
  /** Always true for mock results. Always false for a real Routes API result. */
  mock: boolean;
  label: string;
  disclaimer: string;
  geometryProvenance: GeometryProvenance;
  provenanceNote: string | null;
  routes: ReconstructedRoute[];
  /** Polyline that was literally present on the URL, drawn separately from any recomputed route. */
  sourcePolyline: { encodedPolyline: string; note: string } | null;
  mapStops: MapStop[];
  fidelity: FidelityDiagnostic;
  googleApi: {
    attempted: boolean;
    enabled: boolean;
    configured: boolean;
    error: string | null;
  };
}

export interface ImportResult {
  parsed: ParsedMapsUrl;
  recoverability: RecoverabilityReport;
}

export interface GoogleApiStatus {
  enabled: boolean;
  configured: boolean;
  liveAvailable: boolean;
  reason: string;
  /** True only when the Maps JavaScript API is explicitly enabled and a key is set. */
  mapsDisplayAvailable: boolean;
  /** Present only when map display is available. The key is required by the browser script. */
  mapsJsKey: string | null;
}

export type ImportOutcome =
  | { ok: true; result: ImportResult }
  | { ok: false; status: number; error: string };

export interface ReconstructSuccess {
  ok: true;
  status: 200;
  parsed: ParsedMapsUrl;
  recoverability: RecoverabilityReport;
  reconstruction: ReconstructionResult;
}

export interface ReconstructFailure {
  ok: false;
  status: number;
  error: string;
  googleApi?: GoogleApiStatus;
}

export type ReconstructOutcome = ReconstructSuccess | ReconstructFailure;
