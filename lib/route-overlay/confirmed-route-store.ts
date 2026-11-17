import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSessionId } from "@/lib/route-overlay/confirmation-session";

/** Temporary local retention aligned with the Maps Platform 30-day lat/lng cache limit. */
export const CONFIRMED_ROUTE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface ConfirmedRouteRecord {
  revisionId: string;
  confirmedAt: string;
  expiresAt: string;
  candidateId: string;
  label: string;
  encodedPolyline: string;
  distanceMeters: number | null;
  durationSeconds: number | null;
  routingRevision: string;
  sessionId: string;
  source: "google_routes_api" | "mock";
  synthetic: boolean;
}

export interface AnalysisGeometryChoice {
  status: "confirmed" | "labeled_default" | "unavailable";
  reason: string;
  confirmed: ConfirmedRouteRecord | null;
}

export function routeRevisionId(encodedPolyline: string): string {
  return createHash("sha256").update(encodedPolyline).digest("hex");
}

export function buildConfirmedRoute(
  input: Omit<ConfirmedRouteRecord, "revisionId" | "expiresAt">,
  now = Date.parse(input.confirmedAt),
): ConfirmedRouteRecord | null {
  if (!input.encodedPolyline || !input.candidateId || !input.routingRevision || !assertSessionId(input.sessionId)) {
    return null;
  }
  if (input.source !== "google_routes_api" && input.source !== "mock") {
    return null;
  }
  const confirmedMs = Date.parse(input.confirmedAt);
  if (Number.isNaN(confirmedMs) || Number.isNaN(now)) {
    return null;
  }
  return {
    ...input,
    revisionId: routeRevisionId(input.encodedPolyline),
    sessionId: assertSessionId(input.sessionId) ?? input.sessionId,
    expiresAt: new Date(confirmedMs + CONFIRMED_ROUTE_RETENTION_MS).toISOString(),
  };
}

export function readConfirmedRoute(value: unknown, now: number): ConfirmedRouteRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<ConfirmedRouteRecord>;
  if (
    typeof record.encodedPolyline !== "string"
    || typeof record.confirmedAt !== "string"
    || typeof record.expiresAt !== "string"
    || typeof record.candidateId !== "string"
    || typeof record.label !== "string"
    || typeof record.routingRevision !== "string"
    || typeof record.sessionId !== "string"
    || !assertSessionId(record.sessionId)
    || (record.source !== "google_routes_api" && record.source !== "mock")
    || typeof record.synthetic !== "boolean"
    || typeof record.revisionId !== "string"
  ) {
    return null;
  }
  const expiresMs = Date.parse(record.expiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= now) {
    return null;
  }
  if (record.revisionId !== routeRevisionId(record.encodedPolyline)) {
    return null;
  }
  return record as ConfirmedRouteRecord;
}

/**
 * A request for the confirmed Google geometry never falls back to a cached default.
 * The default remains available only when the caller labels that choice.
 */
export function selectAnalysisGeometry(
  requirement: "confirmed_google" | "labeled_default",
  confirmed: ConfirmedRouteRecord | null,
): AnalysisGeometryChoice {
  if (requirement === "labeled_default") {
    return {
      status: "labeled_default",
      reason: "The caller asked for the cached default and labeled it as such.",
      confirmed: null,
    };
  }
  if (!confirmed || confirmed.synthetic || confirmed.source !== "google_routes_api") {
    return {
      status: "unavailable",
      reason: "No unexpired user-confirmed Google route is stored. The cached default was not substituted.",
      confirmed: null,
    };
  }
  return {
    status: "confirmed",
    reason: "The stored confirmation is an unexpired Google route.",
    confirmed,
  };
}

export function confirmedRouteDirectory(): string {
  return process.env.ROUTE_OVERLAY_CONFIRMED_ROUTE_DIR
    ?? path.join(process.cwd(), ".route-overlay", "confirmed-routes");
}

/** A session file name is only the validated id, so one session cannot address another file. */
export function sessionConfirmedRoutePath(sessionId: string): string | null {
  const id = assertSessionId(sessionId);
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    return null;
  }
  const fileName = `${id}.json`;
  const filePath = path.join(confirmedRouteDirectory(), fileName);
  if (path.basename(filePath) !== fileName) {
    return null;
  }
  return filePath;
}

export function writeConfirmedRoute(record: ConfirmedRouteRecord, filePath: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(record)}\n`);
}

export function writeSessionConfirmedRoute(record: ConfirmedRouteRecord): boolean {
  const filePath = sessionConfirmedRoutePath(record.sessionId);
  if (!filePath) {
    return false;
  }
  writeConfirmedRoute(record, filePath);
  return true;
}

export type ConfirmedRouteDisposition = "valid" | "expired" | "untrusted" | "absent";

/**
 * Classifies a stored confirmation. Expired and untrusted files still contain
 * a polyline and must be deleted by the loader. A missing or unrelated file
 * is left untouched.
 */
export function confirmedRouteDisposition(value: unknown, now: number): ConfirmedRouteDisposition {
  if (!value || typeof value !== "object") {
    return "absent";
  }
  const record = value as Partial<ConfirmedRouteRecord>;
  if (typeof record.encodedPolyline !== "string" || record.encodedPolyline.length === 0) {
    return "absent";
  }
  const expiresMs = typeof record.expiresAt === "string" ? Date.parse(record.expiresAt) : Number.NaN;
  if (!Number.isNaN(expiresMs) && expiresMs <= now) {
    return "expired";
  }
  if (typeof record.revisionId !== "string" || record.revisionId !== routeRevisionId(record.encodedPolyline)) {
    return "untrusted";
  }
  return readConfirmedRoute(value, now) ? "valid" : "untrusted";
}

export function loadConfirmedRoute(now: number, filePath: string): ConfirmedRouteRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
  const disposition = confirmedRouteDisposition(parsed, now);
  if (disposition === "expired" || disposition === "untrusted") {
    try {
      unlinkSync(filePath);
    } catch {
      // The confirmation is still unusable when deletion fails.
    }
    return null;
  }
  return disposition === "valid" ? readConfirmedRoute(parsed, now) : null;
}

export function loadSessionConfirmedRoute(now: number, sessionId: string): ConfirmedRouteRecord | null {
  const filePath = sessionConfirmedRoutePath(sessionId);
  const expected = assertSessionId(sessionId);
  if (!filePath || !expected) {
    return null;
  }
  const record = loadConfirmedRoute(now, filePath);
  if (!record || record.sessionId !== expected) {
    if (record) {
      try {
        unlinkSync(filePath);
      } catch {
        // A mismatched session file is not returned.
      }
    }
    return null;
  }
  return record;
}
