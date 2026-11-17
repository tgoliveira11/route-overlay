import { NextResponse } from "next/server";
import { reserveLiveCall } from "@/lib/route-overlay/live-budget";

export const dynamic = "force-dynamic";

/** Reserves one Google map instantiation. Does not accept or return credentials. */
export function POST() {
  const reservation = reserveLiveCall("mapLoad");
  const body = {
    allowed: reservation.allowed,
    reason: reservation.reason,
    mapLoads: reservation.snapshot.mapLoads,
    computeRoutesCalls: reservation.snapshot.computeRoutesCalls,
  };
  return NextResponse.json(body, { status: reservation.allowed ? 200 : 429 });
}
