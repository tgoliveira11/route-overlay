import { readFileSync } from "node:fs";
import path from "node:path";
import { SiteHeader } from "@/components/site-header";

export const dynamic = "force-dynamic";

interface DetourSummary {
  revisionId: string;
  fuelingStopSeconds: number;
  computeRoutesCallsCumulative: number;
  placesCallsThisRun: number;
  candidates: Array<{
    cnpj: string;
    name: string;
    municipio: string;
    uf: string;
    brand: string;
    band: string;
    progressKm: number;
    straightLineKm: number;
    measured: boolean;
  }>;
  measurements: Array<{
    cnpj: string;
    status: string;
    directDistanceMeters: number | null;
    viaDistanceMeters: number | null;
    extraDistanceMeters: number | null;
    extraDrivingSeconds: number | null;
    fidelity: string | null;
    viaFidelity?: string | null;
  }>;
}

export default function DetoursPage() {
  const summary = readSummary();
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
        <div>
          <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Experimental detour diagnostic</p>
          <h1 className="font-heading text-4xl tracking-tight">Road access, not a fuel recommendation</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground" data-testid="detour-disclaimer">
            These figures compare driving between two anchors on the confirmed route with and without a station stop. They do not show that a station is open, stocked, or a recommended stop. Fueling time is separate and is {summary?.fuelingStopSeconds ?? 0} seconds in this experiment. This page does not call Google.
          </p>
        </div>
        {!summary ? (
          <p data-testid="detour-missing">No detour measurements are stored for this checkout.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" data-testid="detour-revision">
              Confirmed revision {summary.revisionId.slice(0, 12)}. Cumulative computeRoutes calls recorded locally: {summary.computeRoutesCallsCumulative}. Places calls in this run: {summary.placesCallsThisRun}.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="detour-table">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="py-2 pr-3">Station</th>
                    <th className="py-2 pr-3">Progress</th>
                    <th className="py-2 pr-3">Straight line</th>
                    <th className="py-2 pr-3">Direct</th>
                    <th className="py-2 pr-3">Via station</th>
                    <th className="py-2 pr-3">Extra</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.candidates.map((candidate) => {
                    const measurement = summary.measurements.find((item) => item.cnpj === candidate.cnpj);
                    return (
                      <tr key={candidate.cnpj} className="border-b border-border/70">
                        <td className="py-2 pr-3">{candidate.name}<br />{candidate.municipio}/{candidate.uf} · {candidate.brand}</td>
                        <td className="py-2 pr-3">{candidate.progressKm.toFixed(1)} km</td>
                        <td className="py-2 pr-3">{candidate.straightLineKm.toFixed(2)} km</td>
                        <td className="py-2 pr-3">{km(measurement?.directDistanceMeters)}</td>
                        <td className="py-2 pr-3">{km(measurement?.viaDistanceMeters)}</td>
                        <td className="py-2 pr-3">{measurement?.extraDistanceMeters == null ? "Not measured" : `${(measurement.extraDistanceMeters / 1000).toFixed(2)} km · ${measurement.extraDrivingSeconds == null ? "—" : (measurement.extraDrivingSeconds / 60).toFixed(1)} min`}</td>
                        <td className="py-2">{measurement?.status ?? "Not measured"}{measurement?.viaFidelity ? ` / via ${measurement.viaFidelity}` : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </>
  );
}

function km(meters: number | null | undefined): string {
  return meters == null ? "Not measured" : `${(meters / 1000).toFixed(2)} km`;
}

function readSummary(): DetourSummary | null {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), "data", "phase8-detour-summary.json"), "utf8")) as DetourSummary;
  } catch {
    return null;
  }
}
