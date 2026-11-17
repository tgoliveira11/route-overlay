import { NextResponse } from "next/server";
import { assertSessionId } from "@/lib/route-overlay/confirmation-session";
import {
  buildConfirmedRoute,
  loadSessionConfirmedRoute,
  writeSessionConfirmedRoute,
} from "@/lib/route-overlay/confirmed-route-store";
import { localDiagnosticRefusal } from "@/lib/route-overlay/local-diagnostic";

export const dynamic = "force-dynamic";

/**
 * Stores one explicitly confirmed route for the calling browser session.
 * The response returns the revision id and expiry, not the polyline.
 */
export async function POST(request: Request) {
  const refusal = localDiagnosticRefusal(request);
  if (refusal) {
    return NextResponse.json({ stored: false, reason: refusal }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ stored: false, reason: "The confirmation body was not JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ stored: false, reason: "The confirmation body was empty." }, { status: 400 });
  }
  const value = body as Record<string, unknown>;
  const sessionId = assertSessionId(typeof value.sessionId === "string" ? value.sessionId : "");
  if (!sessionId) {
    return NextResponse.json({ stored: false, reason: "The confirmation session id is invalid." }, { status: 400 });
  }
  loadSessionConfirmedRoute(Date.now(), sessionId);
  const source = value.source === "google_routes_api" || value.source === "mock" ? value.source : null;
  if (!source || typeof value.encodedPolyline !== "string" || typeof value.confirmedAt !== "string") {
    return NextResponse.json({ stored: false, reason: "The confirmation is missing geometry or time." }, { status: 400 });
  }
  const record = buildConfirmedRoute({
    confirmedAt: value.confirmedAt,
    candidateId: typeof value.candidateId === "string" ? value.candidateId : "",
    label: typeof value.label === "string" ? value.label : "",
    encodedPolyline: value.encodedPolyline,
    distanceMeters: typeof value.distanceMeters === "number" ? value.distanceMeters : null,
    durationSeconds: typeof value.durationSeconds === "number" ? value.durationSeconds : null,
    routingRevision: typeof value.routingRevision === "string" ? value.routingRevision : "",
    sessionId,
    source,
    synthetic: value.synthetic === true,
  });
  if (!record || !writeSessionConfirmedRoute(record)) {
    return NextResponse.json({ stored: false, reason: "The confirmation could not be stored." }, { status: 400 });
  }
  return NextResponse.json({
    stored: true,
    sessionId,
    revisionId: record.revisionId,
    expiresAt: record.expiresAt,
    source: record.source,
    synthetic: record.synthetic,
  });
}
