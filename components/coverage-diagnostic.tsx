"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverageMap } from "@/components/coverage-map";
import { confirmationSessionId } from "@/lib/route-overlay/confirmation-session";
import type { ConfirmedCoverageComparison } from "@/lib/route-overlay/stations/confirmed-coverage";
import type { CoverageSummary } from "@/lib/route-overlay/stations/types";

export function CoverageDiagnostic({ summary }: { summary: CoverageSummary | null }) {
  if (!summary) {
    return (
      <section className="mx-auto max-w-6xl px-4 py-8">
        <p data-testid="coverage-missing">Premium-station results have not been generated for this checkout.</p>
      </section>
    );
  }
  const population = summary.population;
  return (
    <section className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
      <div>
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">Premium fuel coverage</p>
        <h1 className="font-heading text-4xl tracking-tight">Santos–Montevideo diagnostic</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Experimental research view. These figures are not a fuel-stop recommendation, and they do not show that a station is open or has premium gasoline in stock.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Route analyzed</CardTitle>
          <CardDescription data-testid="coverage-route">
            Cached Google default route {summary.route.candidateId}, {summary.route.description}. Brazilian portion{" "}
            {(summary.route.brazilianLengthMeters / 1000).toFixed(1)} km. Confirmed geometry available:{" "}
            {String(summary.route.confirmedGeometryAvailable)}. Fidelity {summary.route.fidelity}.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric testId="coverage-registered" label="Registered in corridor municipalities" value={population.registeredInCorridorMunicipalities} note={`of ${population.nationalCsvRecords} national CSV rows`} />
          <Metric testId="coverage-premium" label="Explicit premium gasoline" value={population.premiumExplicit} note="ANP product text, not brand" />
          <Metric testId="coverage-within-2" label="Premium within 2 km" value={population.premiumWithin2Km} note="Historical cached-default screen. Not a confirmed revision." />
          <Metric testId="coverage-within-5" label="Premium from 2 to 5 km" value={population.premiumBetween2And5Km} note={`${population.premiumUngeolocated} premium without coordinates. Cached default was not substituted for a missing confirmation.`} />
          <Metric testId="coverage-coordinates" label="Premium with coordinates" value={population.premiumWithCoordinates} note={`${population.coordinateConflicts} low-quality coordinates`} />
          <Metric testId="coverage-hours" label="Hours cross-checked" value={summary.places?.hoursCrossChecked ?? "UNKNOWN"} note={summary.places ? `${summary.places.regularHoursReturned} of ${summary.places.requested} Google regular-hour records; not independently verified` : "Places sample not run"} />
          <Metric testId="coverage-places" label="Places matches confirmed" value={summary.places?.matchConfirmed ?? "UNKNOWN"} note={summary.places ? `${summary.places.reviewRequired} need review in a sample of ${summary.places.requested}` : "Places sample not run"} />
          <Metric testId="coverage-podium" label="Explicit Podium text" value={population.podiumText} note="ANP product descriptions. Locator sample is in the warnings." />
          <Metric testId="coverage-api" label="API records in scope" value={population.apiRecordsInCorridorMunicipalities} note={`${population.apiPagesRetrieved} pages`} />
        </CardContent>
      </Card>
      <ConfirmedRevisionStatus summary={summary} />
      <Card>
        <CardHeader>
          <CardTitle>Warnings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground" data-testid="coverage-warnings">
            {summary.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Premium stations on the Google map</CardTitle>
          <CardDescription>
            Markers use ANP coordinates for premium stations within 5 km. They are not a driving-access claim, and missing Uruguay records are outside ANP coverage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CoverageMap stations={summary.corridorPremiumStations} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Representative records</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-2 pr-3">Station</th>
                <th className="py-2 pr-3">Place</th>
                <th className="py-2 pr-3">Brand</th>
                <th className="py-2 pr-3">Distance</th>
                <th className="py-2">Location</th>
              </tr>
            </thead>
            <tbody>
              {summary.representativeStations.map((station) => (
                <tr key={station.cnpj} className="border-b border-border/70">
                  <td className="py-2 pr-3">{station.razaoSocial}</td>
                  <td className="py-2 pr-3">{station.municipio}/{station.uf}</td>
                  <td className="py-2 pr-3">{station.bandeira || "Unknown"}</td>
                  <td className="py-2 pr-3">{station.distanceToRouteMeters === null ? "No coordinate" : `${(station.distanceToRouteMeters / 1000).toFixed(1)} km`}</td>
                  <td className="py-2"><Badge variant="outline">{station.locationQuality}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

function ConfirmedRevisionStatus({ summary }: { summary: CoverageSummary }) {
  const [comparison, setComparison] = useState<ConfirmedCoverageComparison | null>(null);
  useEffect(() => {
    let sessionId: string;
    try {
      sessionId = confirmationSessionId(window.sessionStorage, () => crypto.randomUUID());
    } catch {
      return;
    }
    void fetch("/api/stations/confirmed-coverage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    }).then(async (response) => {
      if (!response.ok) {
        return;
      }
      setComparison(await response.json() as ConfirmedCoverageComparison);
    }).catch(() => undefined);
  }, []);
  const confirmed = comparison?.status === "confirmed" ? comparison.confirmed : null;
  const historicalOutside = summary.population.premiumExplicit
    - summary.population.premiumWithin2Km
    - summary.population.premiumBetween2And5Km
    - summary.population.premiumUngeolocated;
  const text = confirmed
    ? `Confirmed revision ${comparison?.revisionId?.slice(0, 12)} uses this session's Google Routes geometry. It is not the original Google Maps alternative, and it is not evidence of fuel in stock.`
    : "Confirmed route revision: unavailable for this browser session. The cached default counts were not substituted.";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cached default versus confirmed revision</CardTitle>
        <CardDescription data-testid="coverage-confirmed-status">{text}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="coverage-comparison">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-3">Metric</th>
              <th className="py-2 pr-3">Cached default</th>
              <th className="py-2">Confirmed revision</th>
            </tr>
          </thead>
          <tbody>
            <ComparisonRow label="Source" cached="cached_google_default_route" confirmed={confirmed?.sourceLabel ?? "Unavailable"} />
            <ComparisonRow label="Route points" cached={summary.route.pointCount} confirmed={confirmed ? confirmed.pointCount : "Unavailable"} />
            <ComparisonRow label="Route length" cached={kilometers(summary.route.distanceMeters)} confirmed={confirmed ? kilometers(confirmed.routeLengthMeters) : "Unavailable"} />
            <ComparisonRow label="Brazilian segment" cached={kilometers(summary.route.brazilianLengthMeters)} confirmed={confirmed ? kilometers(confirmed.brazilianLengthMeters) : "Unavailable"} />
            <ComparisonRow label="Premium within 2 km" cached={summary.population.premiumWithin2Km} confirmed={confirmed ? confirmed.premiumWithin2Km : "Unavailable"} />
            <ComparisonRow label="Premium from 2 to 5 km" cached={summary.population.premiumBetween2And5Km} confirmed={confirmed ? confirmed.premiumBetween2And5Km : "Unavailable"} />
            <ComparisonRow label="Premium outside 5 km" cached={historicalOutside} confirmed={confirmed ? confirmed.premiumOutside5Km : "Unavailable"} />
            <ComparisonRow label="Premium without coordinates" cached={summary.population.premiumUngeolocated} confirmed={confirmed ? confirmed.premiumUngeolocated : "Unavailable"} />
            <ComparisonRow label="Entered the 2 km band" cached="Historical screen" confirmed={confirmed ? confirmed.premiumEnteredWithin2Km : "Unavailable"} />
            <ComparisonRow label="Left the 2 km band" cached="Historical screen" confirmed={confirmed ? confirmed.premiumLeftWithin2Km : "Unavailable"} />
            <ComparisonRow label="Band changes" cached="Historical screen" confirmed={confirmed ? confirmed.premiumBandChanges : "Unavailable"} />
            <ComparisonRow label="Gaps over 100 km" cached={summary.gapsOver100Km.length} confirmed={confirmed ? confirmed.gapsOver100Km.length : "Unavailable"} />
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          ANP coordinates in this extract are unvalidated. Straight-line bands are not driving detours, opening hours, or current stock.
        </p>
      </CardContent>
    </Card>
  );
}

function ComparisonRow({ label, cached, confirmed }: { label: string; cached: number | string; confirmed: number | string }) {
  return (
    <tr className="border-b border-border/70">
      <td className="py-2 pr-3">{label}</td>
      <td className="py-2 pr-3">{cached}</td>
      <td className="py-2">{confirmed}</td>
    </tr>
  );
}

function kilometers(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function Metric({ testId, label, value, note }: { testId: string; label: string; value: number | string; note: string }) {
  return (
    <div className="rounded-md border border-border p-3" data-testid={testId}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-medium">{value}</p>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
