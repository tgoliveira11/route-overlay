import { readFileSync } from "node:fs";
import path from "node:path";
import { CoverageDiagnostic } from "@/components/coverage-diagnostic";
import { SiteHeader } from "@/components/site-header";
import type { CoverageSummary } from "@/lib/route-overlay/stations/types";

export const dynamic = "force-dynamic";

export default function CoveragePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <CoverageDiagnostic summary={readSummary()} />
      </main>
    </>
  );
}

function readSummary(): CoverageSummary | null {
  try {
    const filePath = path.join(process.cwd(), "data", "phase5-coverage-summary.json");
    return JSON.parse(readFileSync(filePath, "utf8")) as CoverageSummary;
  } catch {
    return null;
  }
}
