import { NextResponse } from "next/server";
import { assertSessionId } from "@/lib/route-overlay/confirmation-session";
import { localDiagnosticRefusal } from "@/lib/route-overlay/local-diagnostic";
import { readConfirmedCoverage } from "@/lib/route-overlay/stations/confirmed-coverage";

export const dynamic = "force-dynamic";

/** Returns band counts for one session's confirmed route. The polyline stays on disk. */
export async function POST(request: Request) {
  const refusal = localDiagnosticRefusal(request);
  if (refusal) {
    return NextResponse.json({ status: "unavailable", reason: refusal, cachedDefaultSubstituted: false }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "unavailable", reason: "The request was not JSON.", cachedDefaultSubstituted: false }, { status: 400 });
  }
  const sessionId = body && typeof body === "object" && typeof (body as { sessionId?: unknown }).sessionId === "string"
    ? assertSessionId((body as { sessionId: string }).sessionId)
    : null;
  if (!sessionId) {
    return NextResponse.json({ status: "unavailable", reason: "The confirmation session id is invalid.", cachedDefaultSubstituted: false }, { status: 400 });
  }
  const comparison = readConfirmedCoverage(Date.now(), sessionId);
  return NextResponse.json(comparison);
}
