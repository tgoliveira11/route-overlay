import { NextResponse } from "next/server";
import { fileLiveBudgetStore, reserveLiveCall } from "@/lib/route-overlay/live-budget";
import { filePhase5BudgetStore, reservePhase5Call } from "@/lib/route-overlay/stations/budget";

export const dynamic = "force-dynamic";

/**
 * Reserves one coverage-map load against both the Phase 5 ceiling and the
 * existing Routes map ceiling. A denial does not leave either counter incremented.
 */
export function POST() {
  const phase5Store = filePhase5BudgetStore();
  const phase5 = reservePhase5Call("mapLoads", phase5Store);
  if (!phase5.allowed) {
    return NextResponse.json(
      { allowed: false, reason: phase5.reason, phase5MapLoads: phase5.snapshot.mapLoads },
      { status: 429 },
    );
  }
  const global = reserveLiveCall("mapLoad", fileLiveBudgetStore());
  if (!global.allowed) {
    const current = phase5Store.read();
    phase5Store.write({ ...current, mapLoads: Math.max(0, current.mapLoads - 1) });
    return NextResponse.json(
      { allowed: false, reason: global.reason, phase5MapLoads: current.mapLoads - 1 },
      { status: 429 },
    );
  }
  return NextResponse.json({
    allowed: true,
    reason: null,
    phase5MapLoads: phase5.snapshot.mapLoads,
    mapLoads: global.snapshot.mapLoads,
  });
}
