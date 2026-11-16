"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RouteMap } from "@/components/route-map";
import { formatDistance, formatDuration, stopTitle } from "@/lib/route-overlay/geo";
import { SAMPLES } from "@/lib/route-overlay/samples";
import type {
  FieldStatus,
  GoogleApiStatus,
  ImportResult,
  ReconstructionResult,
  RouteStop,
} from "@/lib/route-overlay/types";

type Phase = "idle" | "parsing" | "reconstructing";

export function RouteConsole() {
  const [url, setUrl] = useState("");
  const [expandShortLinks, setExpandShortLinks] = useState(true);
  const [status, setStatus] = useState<GoogleApiStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [reconstruction, setReconstruction] = useState<ReconstructionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/routes/status")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("status");
        }
        return (await response.json()) as GoogleApiStatus;
      })
      .then((payload) => {
        if (!cancelled) {
          setStatus(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatusError("The local status handler did not respond. Mock mode is still the default.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onParse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhase("parsing");
    setError(null);
    setReconstruction(null);
    try {
      const response = await fetch("/api/routes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, expandShortLinks }),
      });
      const payload = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) {
        setImported(null);
        setError(payload.error ?? "The local import handler rejected the URL.");
        return;
      }
      setImported(payload);
    } catch {
      setImported(null);
      setError("The local Route Handler did not respond.");
    } finally {
      setPhase("idle");
    }
  }

  async function onReconstruct(mode: "mock" | "live") {
    setPhase("reconstructing");
    setError(null);
    try {
      const response = await fetch("/api/routes/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, mode, expandShortLinks }),
      });
      const payload = (await response.json()) as {
        error?: string;
        reconstruction?: ReconstructionResult;
      };
      if (!response.ok || !payload.reconstruction) {
        setReconstruction(null);
        setError(payload.error ?? "Reconstruction did not return a result.");
        return;
      }
      setReconstruction(payload.reconstruction);
    } catch {
      setError("The local reconstruction handler did not respond.");
    } finally {
      setPhase("idle");
    }
  }

  const liveAvailable = status?.liveAvailable === true;
  const busy = phase !== "idle";
  const canReconstruct = imported?.recoverability.canReconstructStops === true;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-6">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="text-primary font-mono text-[11px] tracking-[0.22em] uppercase">
            Hypothesis under test
          </p>
          <h1 className="font-heading mt-2 text-3xl leading-tight sm:text-4xl">
            Does a shared Google Maps URL still contain the route that was selected?
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6 sm:text-base">
            Paste a directions link. This console reads the stops on this machine,
            then rebuilds a route in mock mode. The mock result is labeled as mock.
            Google is called only if you explicitly enable the Routes API.
          </p>
        </div>
        <Card className="mock-stripe" data-testid="mode-badge">
          <CardHeader>
            <CardTitle>Runtime</CardTitle>
            <CardDescription>No database. No hosted service required.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Badge variant="default">Mock reconstruction is the default</Badge>
            <p className="text-sm leading-6">
              {status?.reason ??
                statusError ??
                "Checking whether a Google Routes key is configured…"}
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="grid w-full min-w-0 items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="lg:sticky lg:top-4">
          <CardHeader>
            <CardTitle>Import a directions URL</CardTitle>
            <CardDescription>
              Maps URLs API links, /maps/dir/ paths, legacy saddr/daddr links, and
              maps.app.goo.gl short links.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={onParse}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="route-url">Google Maps URL</Label>
                <Textarea
                  id="route-url"
                  data-testid="url-input"
                  value={url}
                  spellCheck={false}
                  placeholder="https://www.google.com/maps/dir/?api=1&origin=...&destination=..."
                  onChange={(event) => setUrl(event.target.value)}
                  className="min-h-32 font-mono text-xs"
                />
              </div>
              <label className="flex items-start gap-2 text-sm leading-5">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={expandShortLinks}
                  data-testid="expand-short-links"
                  onChange={(event) => setExpandShortLinks(event.target.checked)}
                />
                <span>
                  Expand maps.app.goo.gl and goo.gl/maps redirects. Full directions
                  URLs are parsed locally either way.
                </span>
              </label>
              <Button
                type="submit"
                size="lg"
                disabled={busy || url.trim().length === 0}
                data-testid="parse-button"
              >
                {phase === "parsing" ? "Parsing URL…" : "Parse URL"}
              </Button>
            </form>
            <div className="mt-4 flex flex-col gap-2">
              <p className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
                Local samples
              </p>
              {SAMPLES.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  data-testid={`sample-${sample.id}`}
                  className="hover:bg-muted rounded-lg border border-border px-3 py-2 text-left"
                  onClick={() => {
                    setUrl(sample.url);
                    setError(null);
                  }}
                >
                  <span className="block text-sm font-medium">{sample.title}</span>
                  <span className="text-muted-foreground mt-1 block text-xs leading-5">
                    {sample.description}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-4" aria-live="polite">
          {error ? (
            <Alert variant="destructive" data-testid="error">
              <AlertTitle>Import stopped</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {!imported && !error ? (
            <Card>
              <CardHeader>
                <CardTitle>Nothing parsed yet</CardTitle>
                <CardDescription>
                  Choose a sample or paste a link you copied from Google Maps, then
                  parse it. The first result is only what the URL itself contains.
                </CardDescription>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm leading-6">
                A share link usually keeps the stop names and the travel mode. It
                does not keep the alternative you clicked, the drawn polyline, or
                the traffic at that moment. Reconstruction below will say so in
                plain text.
              </CardContent>
            </Card>
          ) : null}

          {imported ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Recovered stops</CardTitle>
                  <CardDescription>{imported.recoverability.summary}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p data-testid="selected-route" className="font-heading text-xl leading-snug">
                    Originally selected route:{" "}
                    {imported.recoverability.geometryPresentInUrl
                      ? "preserved as a polyline on the URL"
                      : "not preserved"}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {imported.parsed.stops.map((stop, index) => (
                      <StopRow key={`${stop.role}-${index}`} stop={stop} index={index} />
                    ))}
                  </ul>
                  {imported.parsed.stops.length === 0 ? (
                    <p className="text-sm">No stops were extracted.</p>
                  ) : null}
                  {imported.parsed.warnings.length > 0 ? (
                    <ul className="text-muted-foreground list-disc pl-5 text-sm leading-6">
                      {imported.parsed.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>What the URL can and cannot recover</CardTitle>
                  <CardDescription>
                    Link shape: {imported.parsed.kind}
                    {imported.parsed.expandedFrom
                      ? ` · expanded from ${imported.parsed.expandedFrom}`
                      : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="max-w-full overflow-x-auto">
                  <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border font-mono text-[11px] tracking-wide uppercase">
                        <th className="py-2 pr-3 font-medium">Field</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 font-medium">Evidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {imported.recoverability.items.map((item) => (
                        <tr
                          key={item.id}
                          data-testid={`field-${item.id}`}
                          className="border-b border-border/70 align-top"
                        >
                          <th className="py-2 pr-3 font-medium">{item.field}</th>
                          <td className="py-2 pr-3">
                            <StatusBadge status={item.status} />
                          </td>
                          <td className="text-muted-foreground py-2 leading-5">{item.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Reconstruction</CardTitle>
                  <CardDescription>
                    Mock mode fabricates a corridor from recovered coordinates, or
                    from a labeled local fixture when the sample URL has only names.
                    It never calls Google.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      size="lg"
                      data-testid="reconstruct-mock"
                      disabled={!canReconstruct || busy}
                      onClick={() => onReconstruct("mock")}
                    >
                      {phase === "reconstructing" ? "Reconstructing…" : "Run mock reconstruction"}
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      variant="outline"
                      data-testid="reconstruct-live"
                      disabled={!canReconstruct || busy || !liveAvailable}
                      onClick={() => onReconstruct("live")}
                    >
                      Run Google Routes API
                    </Button>
                  </div>
                  {!liveAvailable ? (
                    <p className="text-muted-foreground text-sm leading-6">
                      Google Routes stays disabled until{" "}
                      <span className="font-mono">ROUTE_OVERLAY_GOOGLE_API_ENABLED=true</span>{" "}
                      and <span className="font-mono">GOOGLE_ROUTES_API_KEY</span> are both set
                      in <span className="font-mono">.env.local</span>, and the dev server is restarted.
                    </p>
                  ) : (
                    <p className="text-sm leading-6">
                      Live mode is enabled. A successful response is still a new computation,
                      not the alternative that was selected in Maps.
                    </p>
                  )}
                  {!canReconstruct ? (
                    <p className="text-sm">
                      Reconstruction stays unavailable until both endpoints can be read.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </>
          ) : null}

          {reconstruction && imported ? (
            <ReconstructionPanel
              parsed={imported.parsed}
              reconstruction={reconstruction}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StopRow({ stop, index }: { stop: RouteStop; index: number }) {
  const testId =
    stop.role === "origin"
      ? "stop-origin"
      : stop.role === "destination"
        ? "stop-destination"
        : "stop-waypoint";
  return (
    <li
      data-testid={testId}
      className="flex items-start gap-3 rounded-lg border border-border px-3 py-2"
    >
      <span className="bg-secondary text-secondary-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full font-mono text-xs">
        {index + 1}
      </span>
      <span className="min-w-0">
        <span className="text-muted-foreground block font-mono text-[11px] tracking-wide uppercase">
          {stop.role}
          {stop.via ? " · pass-through" : ""}
        </span>
        <span className="block text-sm">{stopTitle(stop)}</span>
        {stop.location && stop.label ? (
          <span className="text-muted-foreground block font-mono text-xs">
            {stop.location.latitude.toFixed(4)}, {stop.location.longitude.toFixed(4)}
          </span>
        ) : null}
      </span>
    </li>
  );
}

function StatusBadge({ status }: { status: FieldStatus }) {
  const variant =
    status === "recovered"
      ? "default"
      : status === "missing"
        ? "destructive"
        : "outline";
  return <Badge variant={variant}>{status.replaceAll("_", " ")}</Badge>;
}

function ReconstructionPanel({
  parsed,
  reconstruction,
}: {
  parsed: ImportResult["parsed"];
  reconstruction: ReconstructionResult;
}) {
  return (
    <Card data-testid={reconstruction.mock ? "mock-banner" : "live-banner"} className={reconstruction.mock ? "mock-stripe" : ""}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{reconstruction.label}</Badge>
          <Badge variant="outline">{reconstruction.geometryProvenance.replaceAll("_", " ")}</Badge>
        </div>
        <CardTitle className="mt-2">Fidelity</CardTitle>
        <CardDescription data-testid="fidelity-verdict">
          {reconstruction.fidelity.headline}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm leading-6">{reconstruction.disclaimer}</p>
        {reconstruction.provenanceNote ? (
          <p className="text-sm leading-6" data-testid="provenance">
            {reconstruction.provenanceNote}
          </p>
        ) : null}
        <RouteMap parsed={parsed} reconstruction={reconstruction} />
        <ul className="flex flex-col gap-2">
          {reconstruction.routes.map((route) => (
            <li key={route.id} className="rounded-lg border border-border px-3 py-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{route.label}</span>
                <span className="font-mono text-xs">
                  {route.synthetic ? "synthetic" : "provider geometry"} ·{" "}
                  {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm leading-5">{route.description}</p>
            </li>
          ))}
        </ul>
        <div>
          <p className="mb-2 font-medium">Why this does or does not match the selection</p>
          <ul className="list-disc pl-5 text-sm leading-6">
            {reconstruction.fidelity.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Raw reconstruction JSON</summary>
          <pre className="mt-3 max-w-full overflow-x-auto font-mono text-[11px] leading-5">
            {JSON.stringify(reconstruction, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}
