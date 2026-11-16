import type { EffortMetrics } from "@/lib/route-overlay/effort";
import { emptyEffort } from "@/lib/route-overlay/effort";
import type {
  GeoPoint,
  GeometryProvenance,
  ReconstructionSource,
  StopRole,
} from "@/lib/route-overlay/types";

export const PLANNING_SESSION_VERSION = 2;
export const PLANNING_SESSION_KEY = "route-overlay.planning-session.v2";

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ConfirmedStop {
  role: StopRole;
  label: string;
  location: GeoPoint | null;
}

export interface ConfirmedItinerary {
  confirmedAt: string;
  source: ReconstructionSource;
  synthetic: boolean;
  /** Always false. User approval is not independent geometric verification. */
  fidelityIndependentlyVerified: false;
  candidateId: string;
  label: string;
  encodedPolyline: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  stops: ConfirmedStop[];
  originalUrl: string;
  /** routingRevision of the draft that produced encodedPolyline. */
  routingRevision: string;
  geometryProvenance: GeometryProvenance;
  status: "user_confirmed";
}

export interface PlanningSession {
  version: typeof PLANNING_SESSION_VERSION;
  importedUrl: string;
  confirmed: ConfirmedItinerary | null;
  metrics: EffortMetrics;
}

export function createSession(importedUrl: string): PlanningSession {
  return {
    version: PLANNING_SESSION_VERSION,
    importedUrl,
    confirmed: null,
    metrics: emptyEffort(),
  };
}

export function parseSession(value: unknown): PlanningSession | null {
  if (!isRecord(value) || value.version !== PLANNING_SESSION_VERSION) {
    return null;
  }
  if (typeof value.importedUrl !== "string" || !value.importedUrl.trim()) {
    return null;
  }
  const metrics = parseMetrics(value.metrics);
  if (!metrics) {
    return null;
  }
  if (value.confirmed === null) {
    return {
      version: PLANNING_SESSION_VERSION,
      importedUrl: value.importedUrl,
      confirmed: null,
      metrics,
    };
  }
  const confirmed = parseConfirmed(value.confirmed);
  if (!confirmed || confirmed.originalUrl !== value.importedUrl) {
    return null;
  }
  return {
    version: PLANNING_SESSION_VERSION,
    importedUrl: value.importedUrl,
    confirmed,
    metrics,
  };
}

export function serializeSession(session: PlanningSession): string {
  return JSON.stringify(session);
}

export function loadSession(store: KeyValueStore): PlanningSession | null {
  const raw = store.getItem(PLANNING_SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return parseSession(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function saveSession(store: KeyValueStore, session: PlanningSession): void {
  store.setItem(PLANNING_SESSION_KEY, serializeSession(session));
}

export function clearSession(store: KeyValueStore): void {
  store.removeItem(PLANNING_SESSION_KEY);
}

function parseConfirmed(value: unknown): ConfirmedItinerary | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.fidelityIndependentlyVerified !== false || value.status !== "user_confirmed") {
    return null;
  }
  if (value.synthetic !== true && value.synthetic !== false) {
    return null;
  }
  if (value.source !== "mock" && value.source !== "google_routes_api") {
    return null;
  }
  if (typeof value.encodedPolyline !== "string" || !value.encodedPolyline) {
    return null;
  }
  if (typeof value.candidateId !== "string" || typeof value.label !== "string") {
    return null;
  }
  if (typeof value.originalUrl !== "string" || typeof value.confirmedAt !== "string") {
    return null;
  }
  if (typeof value.routingRevision !== "string" || !value.routingRevision) {
    return null;
  }
  if (!Array.isArray(value.stops) || value.stops.length < 2) {
    return null;
  }
  const stops: ConfirmedStop[] = [];
  for (const stop of value.stops) {
    const parsed = parseStop(stop);
    if (!parsed) {
      return null;
    }
    stops.push(parsed);
  }
  return {
    confirmedAt: value.confirmedAt,
    source: value.source,
    synthetic: value.synthetic,
    fidelityIndependentlyVerified: false,
    candidateId: value.candidateId,
    label: value.label,
    encodedPolyline: value.encodedPolyline,
    distanceMeters: numberOrNull(value.distanceMeters),
    durationSeconds: numberOrNull(value.durationSeconds),
    stops,
    originalUrl: value.originalUrl,
    routingRevision: value.routingRevision,
    geometryProvenance: parseProvenance(value.geometryProvenance),
    status: "user_confirmed",
  };
}

function parseStop(value: unknown): ConfirmedStop | null {
  if (!isRecord(value) || typeof value.label !== "string") {
    return null;
  }
  if (
    value.role !== "origin" &&
    value.role !== "waypoint" &&
    value.role !== "via" &&
    value.role !== "destination"
  ) {
    return null;
  }
  return {
    role: value.role,
    label: value.label,
    location: parsePoint(value.location),
  };
}

function parsePoint(value: unknown): GeoPoint | null {
  if (value === null) {
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.latitude !== "number" || typeof value.longitude !== "number") {
    return null;
  }
  if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) {
    return null;
  }
  return { latitude: value.latitude, longitude: value.longitude };
}

function parseMetrics(value: unknown): EffortMetrics | null {
  if (!isRecord(value)) {
    return null;
  }
  const outcome = value.outcome;
  if (outcome !== "in_progress" && outcome !== "completed" && outcome !== "abandoned") {
    return null;
  }
  if (!isNonNegativeInt(value.actionsAfterImport)) {
    return null;
  }
  if (!isNonNegativeInt(value.candidatesPresented)) {
    return null;
  }
  if (!isNonNegativeInt(value.waypointsAdded)) {
    return null;
  }
  if (!isNonNegativeInt(value.recalculations)) {
    return null;
  }
  return {
    actionsAfterImport: value.actionsAfterImport,
    candidatesPresented: value.candidatesPresented,
    immediatelyAccepted:
      value.immediatelyAccepted === null ? null : value.immediatelyAccepted === true,
    waypointsAdded: value.waypointsAdded,
    recalculations: value.recalculations,
    confirmationStartedAt: stringOrNull(value.confirmationStartedAt),
    confirmationCompletedAt: stringOrNull(value.confirmationCompletedAt),
    confirmationMs: numberOrNull(value.confirmationMs),
    outcome,
  };
}

function parseProvenance(value: unknown): ConfirmedItinerary["geometryProvenance"] {
  if (
    value === "none" ||
    value === "synthetic_from_url_coordinates" ||
    value === "synthetic_from_local_sample_fixture" ||
    value === "google_routes_polyline"
  ) {
    return value;
  }
  return "none";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function numberOrNull(value: unknown): number | null {
  if (value === null) {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null) {
    return null;
  }
  return typeof value === "string" ? value : null;
}
