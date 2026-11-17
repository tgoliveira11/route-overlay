"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { GoogleRouteMap } from "@/components/google-route-map";
import { RouteMap } from "@/components/route-map";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { presentCandidates, type RouteCandidate } from "@/lib/route-overlay/candidates";
import {
  PLANNING_SESSION_VERSION,
  clearSession,
  loadSession,
  saveSession,
  type ConfirmedItinerary,
  type PlanningSession,
} from "@/lib/route-overlay/confirmation";
import {
  classifyFriction,
  emptyEffort,
  invalidateConfirmation,
  markAbandoned,
  markConfirmationStarted,
  markConfirmed,
  recordAction,
  type EffortMetrics,
} from "@/lib/route-overlay/effort";
import type { FuelType } from "@/lib/route-overlay/fuel-stations";
import { formatDistance, formatDuration, stopTitle } from "@/lib/route-overlay/geo";
import {
  applyDraft,
  createDraftWaypoint,
  describeRoutingConstraints,
  intermediateDrafts,
  moveDraft,
  removeDraft,
  type DraftWaypoint,
} from "@/lib/route-overlay/refinement";
import {
  confirmationEligibility,
  isCurrentRouteRequest,
  routingRevision,
} from "@/lib/route-overlay/revision";
import { PLAN_SCENARIOS } from "@/lib/route-overlay/scenarios";
import { planStopsAlongPolyline, type StopPlan } from "@/lib/route-overlay/stop-plan";
import type {
  GoogleApiStatus,
  ImportResult,
  ParsedMapsUrl,
  ReconstructionResult,
} from "@/lib/route-overlay/types";

type Phase = "idle" | "parsing" | "reconstructing";

export function AssistedPlanner() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<GoogleApiStatus | null>(null);
  const [imported, setImported] = useState<ImportResult | null>(null);
  const [draft, setDraft] = useState<DraftWaypoint[]>([]);
  const [waypointInput, setWaypointInput] = useState("");
  const [reconstruction, setReconstruction] = useState<ReconstructionResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<ConfirmedItinerary | null>(null);
  const [metrics, setMetrics] = useState<EffortMetrics>(emptyEffort());
  const [error, setError] = useState<string | null>(null);
  const [stopPlan, setStopPlan] = useState<StopPlan | null>(null);
  const [fuel, setFuel] = useState<FuelType>("gasoline");
  const [rangeKm, setRangeKm] = useState(500);
  const [reserveKm, setReserveKm] = useState(80);
  const [maxDetourKm, setMaxDetourKm] = useState(40);
  const [intervalKm, setIntervalKm] = useState(350);
  const [prefer24h, setPrefer24h] = useState(false);
  const [geometryRevision, setGeometryRevision] = useState<string | null>(null);
  const [awaitingRecalculation, setAwaitingRecalculation] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const stored = loadSession(window.localStorage);
    if (!stored) {
      return;
    }
    setUrl(stored.importedUrl);
    setMetrics(stored.metrics);
    if (stored.confirmed && stored.confirmed.originalUrl === stored.importedUrl) {
      setConfirmed(stored.confirmed);
    }
  }, []);

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
          setStatus(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const working = useMemo(() => {
    if (!imported) {
      return null;
    }
    return applyDraft(imported.parsed, draft);
  }, [imported, draft]);

  const candidates = useMemo(() => {
    if (!working || !reconstruction) {
      return null;
    }
    return presentCandidates(working, reconstruction);
  }, [working, reconstruction]);

  const selected = candidates?.candidates.find((candidate) => candidate.id === selectedId) ?? null;
  const liveAvailable = status?.liveAvailable === true;
  const mapsDisplayAvailable = status?.mapsDisplayAvailable === true && Boolean(status.mapsJsKey);
  const friction = classifyFriction(metrics);
  const eligibility = confirmationEligibility({
    draftRevision: working ? routingRevision(working) : null,
    geometryRevision,
    mock: reconstruction?.mock !== false,
    mapsDisplayReady: mapsReady,
    candidateConfirmable: Boolean(selected?.confirmable && selected.route.encodedPolyline),
  });

  function persistClearedConfirmation(nextMetrics: EffortMetrics) {
    if (!imported) {
      clearSession(window.localStorage);
      return;
    }
    saveSession(window.localStorage, {
      version: PLANNING_SESSION_VERSION,
      importedUrl: imported.parsed.inputUrl,
      confirmed: null,
      metrics: nextMetrics,
    });
  }

  function discardGeometry(
    nextDraft: DraftWaypoint[],
    nextMetrics: EffortMetrics = invalidateConfirmation(metrics),
  ) {
    requestGeneration.current += 1;
    setDraft(nextDraft);
    setReconstruction(null);
    setGeometryRevision(null);
    setSelectedId(null);
    setConfirmed(null);
    setStopPlan(null);
    setMapsReady(false);
    setAwaitingRecalculation(true);
    setMetrics(nextMetrics);
    persistClearedConfirmation(nextMetrics);
  }

  async function onParse(event: FormEvent) {
    event.preventDefault();
    setPhase("parsing");
    setError(null);
    setReconstruction(null);
    setSelectedId(null);
    setStopPlan(null);
    try {
      const response = await fetch("/api/routes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, expandShortLinks: true }),
      });
      const payload = (await response.json()) as ImportResult & { error?: string };
      if (!response.ok) {
        requestGeneration.current += 1;
        setImported(null);
        setDraft([]);
        setReconstruction(null);
        setGeometryRevision(null);
        setSelectedId(null);
        setConfirmed(null);
        setStopPlan(null);
        setMapsReady(false);
        setAwaitingRecalculation(false);
        setMetrics(emptyEffort());
        clearSession(window.localStorage);
        setError(payload.error ?? "The URL could not be imported.");
        return;
      }
      requestGeneration.current += 1;
      const freshMetrics = emptyEffort();
      setImported(payload);
      setDraft(intermediateDrafts(payload.parsed));
      setReconstruction(null);
      setGeometryRevision(null);
      setSelectedId(null);
      setConfirmed(null);
      setStopPlan(null);
      setMapsReady(false);
      setAwaitingRecalculation(false);
      setMetrics(freshMetrics);
      saveSession(window.localStorage, {
        version: PLANNING_SESSION_VERSION,
        importedUrl: payload.parsed.inputUrl,
        confirmed: null,
        metrics: freshMetrics,
      });
    } catch {
      requestGeneration.current += 1;
      setImported(null);
      setDraft([]);
      setReconstruction(null);
      setGeometryRevision(null);
      setSelectedId(null);
      setConfirmed(null);
      setStopPlan(null);
      setMapsReady(false);
      setAwaitingRecalculation(false);
      setMetrics(emptyEffort());
      clearSession(window.localStorage);
      setError("The import request failed before a response arrived.");
    } finally {
      setPhase("idle");
    }
  }

  async function reconstruct(mode: "mock" | "live") {
    if (!working) {
      return;
    }
    const generation = requestGeneration.current;
    const revision = routingRevision(working);
    setPhase("reconstructing");
    setError(null);
    setStopPlan(null);
    setMapsReady(false);
    try {
      const response = await fetch("/api/routes/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: working.normalizedUrl,
          mode,
          expandShortLinks: false,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        parsed?: ParsedMapsUrl;
        reconstruction?: ReconstructionResult;
      };
      if (!isCurrentRouteRequest(generation, requestGeneration.current, revision, routingRevision(working))) {
        return;
      }
      if (!response.ok || !payload.reconstruction || !payload.parsed) {
        setError(payload.error ?? "Reconstruction did not return a route.");
        return;
      }
      const offered = presentCandidates(working, payload.reconstruction);
      setReconstruction(payload.reconstruction);
      setGeometryRevision(revision);
      setAwaitingRecalculation(false);
      setConfirmed(null);
      setSelectedId(offered.candidates[0]?.id ?? null);
      if (imported) {
        saveSession(window.localStorage, {
          version: PLANNING_SESSION_VERSION,
          importedUrl: imported.parsed.inputUrl,
          confirmed: null,
          metrics,
        });
      }
      setMetrics((current) => {
        const started = markConfirmationStarted(current, new Date().toISOString());
        return {
          ...recordAction(started),
          candidatesPresented: offered.candidates.length,
        };
      });
    } catch {
      setError("Reconstruction failed before a response arrived.");
    } finally {
      setPhase("idle");
    }
  }

  function onConfirm() {
    if (!imported || !working || !reconstruction || !eligibility.allowed || !selected?.route.encodedPolyline || !geometryRevision) {
      return;
    }
    const nextConfirmed: ConfirmedItinerary = {
      confirmedAt: new Date().toISOString(),
      source: reconstruction.source,
      synthetic: reconstruction.mock,
      fidelityIndependentlyVerified: false,
      candidateId: selected.id,
      label: selected.route.label,
      encodedPolyline: selected.route.encodedPolyline,
      distanceMeters: selected.route.distanceMeters,
      durationSeconds: selected.route.durationSeconds,
      stops: working.stops.map((stop) => ({
        role: stop.role,
        label: stopTitle(stop),
        location: stop.location,
      })),
      originalUrl: imported.parsed.inputUrl,
      routingRevision: geometryRevision,
      geometryProvenance: reconstruction.geometryProvenance,
      status: "user_confirmed",
    };
    const nextMetrics = markConfirmed(metrics, nextConfirmed.confirmedAt);
    const session: PlanningSession = {
      version: PLANNING_SESSION_VERSION,
      importedUrl: imported.parsed.inputUrl,
      confirmed: nextConfirmed,
      metrics: nextMetrics,
    };
    saveSession(window.localStorage, session);
    setConfirmed(nextConfirmed);
    setMetrics(nextMetrics);
  }

  function onAddWaypoint(event: FormEvent) {
    event.preventDefault();
    const created = createDraftWaypoint(waypointInput, `draft-${crypto.randomUUID()}`);
    if ("error" in created) {
      setError(created.error);
      return;
    }
    discardGeometry(
      [...draft, created],
      invalidateConfirmation({
        ...recordAction(metrics),
        waypointsAdded: metrics.waypointsAdded + 1,
      }),
    );
    setWaypointInput("");
    setError(null);
  }

  async function onRecalculate() {
    setMetrics((current) => ({
      ...current,
      recalculations: current.recalculations + 1,
    }));
    await reconstruct(liveAvailable ? "live" : "mock");
  }

  function onReset() {
    if (confirmed) {
      setMetrics(markAbandoned(metrics));
    } else {
      setMetrics(emptyEffort());
    }
    requestGeneration.current += 1;
    clearSession(window.localStorage);
    setConfirmed(null);
    setReconstruction(null);
    setGeometryRevision(null);
    setSelectedId(null);
    setStopPlan(null);
    setMapsReady(false);
    setAwaitingRecalculation(false);
    setImported(null);
    setDraft([]);
    setUrl("");
    setError(null);
  }

  function onPlanStops(event?: FormEvent) {
    event?.preventDefault();
    if (!confirmed) {
      return;
    }
    setStopPlan(
      planStopsAlongPolyline(confirmed.encodedPolyline, {
        fuel,
        rangeKm,
        reserveKm,
        maxDetourKm,
        intervalKm,
        prefer24h,
      }),
    );
  }

  const mapReconstruction = reconstruction
    ? schematicReconstruction(reconstruction, candidates?.candidates.map((candidate) => candidate.id) ?? [])
    : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-6 px-4 py-6">
      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <div>
          <p className="text-primary font-mono text-[11px] tracking-[0.22em] uppercase">
            Assisted confirmation
          </p>
          <h1 className="font-heading mt-2 text-3xl leading-tight sm:text-4xl">
            Compare a reconstructed itinerary, then confirm it yourself
          </h1>
          <p className="text-muted-foreground mt-3 max-w-2xl text-sm leading-6 sm:text-base">
            Import a Google Maps directions URL, review the stops this machine can read,
            and choose a labeled candidate. Confirmation records your choice. It does not
            prove the geometry matches the alternative that was on screen in Maps.
          </p>
        </div>
        <Card data-testid="plan-mode-badge">
          <CardHeader>
            <CardTitle>Session</CardTitle>
            <CardDescription>Stored only in this browser. Version {PLANNING_SESSION_VERSION}.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm leading-6">
            <Badge variant="default">Mock geometry is the default</Badge>
            <p data-testid="plan-live-status">
              {status?.reason ?? "Checking whether the Google Routes API is enabled…"}
            </p>
            <p data-testid="plan-friction">
              Provisional friction: {friction}. Actions after import: {metrics.actionsAfterImport}.
              Waypoints added: {metrics.waypointsAdded}. Recalculations: {metrics.recalculations}.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>1. Import the shared route</CardTitle>
          <CardDescription>
            The selected Google Maps alternative may not be recoverable from the URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {PLAN_SCENARIOS.map((scenario) => (
              <Button
                key={scenario.id}
                type="button"
                variant="outline"
                size="sm"
                data-testid={`plan-scenario-${scenario.id}`}
                onClick={() => setUrl(scenario.url)}
              >
                {scenario.id}. {scenario.title}
              </Button>
            ))}
          </div>
          <form className="flex flex-col gap-3" onSubmit={onParse}>
            <Label htmlFor="plan-url">Google Maps URL</Label>
            <Textarea
              id="plan-url"
              data-testid="plan-url-input"
              value={url}
              spellCheck={false}
              onChange={(event) => setUrl(event.target.value)}
              className="min-h-28 font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" data-testid="plan-parse" disabled={phase !== "idle" || !url.trim()}>
                {phase === "parsing" ? "Importing…" : "Import URL"}
              </Button>
              <Button type="button" variant="outline" data-testid="plan-reset" onClick={onReset}>
                Reset session
              </Button>
            </div>
          </form>
          {error ? (
            <Alert variant="destructive" data-testid="plan-error">
              <AlertTitle>Import stopped</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {imported ? (
            <ImportSummary parsed={imported.parsed} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
          <CardHeader>
            <CardTitle>2. Reconstruct candidates</CardTitle>
            <CardDescription>
              Mock results stay labeled as mock. Live results are requested only when you enable the API.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                data-testid="plan-reconstruct-mock"
                disabled={phase !== "idle" || !working || !imported?.recoverability.canReconstructStops}
                onClick={() => void reconstruct("mock")}
              >
                {phase === "reconstructing" ? "Reconstructing…" : "Reconstruct with mock fixtures"}
              </Button>
              <Button
                type="button"
                variant="outline"
                data-testid="plan-reconstruct-live"
                disabled={!liveAvailable || phase !== "idle" || !working || !imported?.recoverability.canReconstructStops}
                onClick={() => void reconstruct("live")}
              >
                Reconstruct with Google Routes
              </Button>
            </div>
            {!liveAvailable ? (
              <p className="text-muted-foreground text-sm" data-testid="plan-live-disabled">
                Google Routes credentials are not available. Live reconstruction stays disabled.
              </p>
            ) : null}
            {awaitingRecalculation ? (
              <p data-testid="plan-stale-geometry">
                The draft changed. The previous geometry was discarded. Recalculate before confirming.
              </p>
            ) : null}
            {imported && working && candidates ? (
              <div className="flex flex-col gap-3">
                <p data-testid="plan-candidate-count">
                  {candidates.candidates.length} candidate{candidates.candidates.length === 1 ? "" : "s"} presented.
                </p>
                {candidates.limitation ? (
                  <p data-testid="plan-no-alternatives">{candidates.limitation}</p>
                ) : null}
                <div className="grid gap-3 md:grid-cols-2">
                  {candidates.candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      selected={candidate.id === selectedId}
                      onSelect={() => {
                        setSelectedId(candidate.id);
                        setMetrics((current) => recordAction(current));
                      }}
                    />
                  ))}
                </div>
                {mapReconstruction ? (
                  <RouteMap
                    parsed={working}
                    reconstruction={mapReconstruction}
                    highlightRouteId={selectedId}
                  />
                ) : null}
                {reconstruction && !reconstruction.mock ? (
                  <div className="flex flex-col gap-2">
                    <p data-testid="plan-live-schematic-hidden">
                      Live Google polylines are not drawn on this schematic. They are drawn only on a
                      Google map.
                    </p>
                    {mapsDisplayAvailable && status?.mapsJsKey ? (
                      <GoogleRouteMap
                        apiKey={status.mapsJsKey}
                        routes={reconstruction.routes.map((route) => ({
                          id: route.id,
                          label: route.label,
                          encodedPolyline: route.encodedPolyline,
                          distanceMeters: route.distanceMeters,
                          durationSeconds: route.durationSeconds,
                        }))}
                        stops={reconstruction.mapStops.map((stop) => ({
                          label: stop.label,
                          role: stop.role,
                          latitude: stop.location.latitude,
                          longitude: stop.location.longitude,
                        }))}
                        selectedRouteId={selectedId}
                        onReady={setMapsReady}
                      />
                    ) : (
                      <p data-testid="plan-live-confirm-blocked">
                        Live confirmation is blocked. RouteOverlay will not treat an unseen Google route as approved.
                      </p>
                    )}
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    data-testid="plan-confirm"
                    disabled={!eligibility.allowed}
                    onClick={onConfirm}
                  >
                    Confirm selected candidate
                  </Button>
                  <a
                    className="inline-flex h-8 items-center rounded-lg border px-3 text-sm"
                    data-testid="plan-open-maps"
                    href={imported.parsed.inputUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setMetrics((current) => recordAction(current))}
                  >
                    Open original Google Maps URL
                  </a>
                </div>
                <p data-testid="plan-confirmation-meaning" className="text-sm leading-6">
                  User confirmation is a planning choice. Independently verified fidelity remains false.
                </p>
                {!eligibility.allowed ? (
                  <p data-testid="plan-confirm-blocked">{eligibility.reason}</p>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

      {imported ? (
        <Card>
          <CardHeader>
            <CardTitle>3. Refine waypoints</CardTitle>
            <CardDescription>
              Add, remove, or reorder intermediate stops. Nothing is recalculated until you ask.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ol className="flex flex-col gap-2" data-testid="plan-draft-list">
              {draft.map((waypoint, index) => (
                <li key={waypoint.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span>
                    {index + 1}. {waypoint.label}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`plan-move-up-${index}`}
                    onClick={() => {
                      discardGeometry(moveDraft(draft, waypoint.id, -1));
                      setMetrics((current) => recordAction(current));
                    }}
                  >
                    Move up
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid={`plan-remove-${index}`}
                    onClick={() => {
                      discardGeometry(removeDraft(draft, waypoint.id));
                      setMetrics((current) => recordAction(current));
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ol>
            <form className="flex flex-col gap-2 sm:flex-row" onSubmit={onAddWaypoint}>
              <Label className="sr-only" htmlFor="plan-waypoint">
                Intermediate waypoint
              </Label>
              <Input
                id="plan-waypoint"
                data-testid="plan-waypoint-input"
                value={waypointInput}
                placeholder="-33.6900, -53.4600"
                onChange={(event) => setWaypointInput(event.target.value)}
              />
              <Button type="submit" data-testid="plan-add-waypoint">
                Add waypoint
              </Button>
            </form>
            <Button
              type="button"
              variant="outline"
              data-testid="plan-recalculate"
              disabled={phase !== "idle"}
              onClick={() => void onRecalculate()}
            >
              Recalculate draft
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>4. Stop planning</CardTitle>
          <CardDescription>
            Unlocks after confirmation. Stations are synthetic fixtures, not real businesses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {confirmed ? (
            <form className="flex flex-col gap-3" onSubmit={onPlanStops}>
              <p data-testid="plan-confirmed">
                Confirmed {confirmed.synthetic ? "mock" : "live"} itinerary: {confirmed.label}.
                Stops: {confirmed.stops.map((stop) => stop.label).join(" → ")}.
                Independently verified fidelity: false.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Fuel" id="plan-fuel">
                  <select
                    id="plan-fuel"
                    data-testid="plan-fuel"
                    className="h-8 rounded-lg border bg-transparent px-2 text-sm"
                    value={fuel}
                    onChange={(event) => setFuel(event.target.value as FuelType)}
                  >
                    <option value="gasoline">Gasoline</option>
                    <option value="ethanol">Ethanol</option>
                    <option value="diesel">Diesel</option>
                    <option value="electric">Electric</option>
                  </select>
                </Field>
                <NumberField id="plan-range" label="Range km" value={rangeKm} onChange={setRangeKm} />
                <NumberField id="plan-reserve" label="Reserve km" value={reserveKm} onChange={setReserveKm} />
                <NumberField id="plan-detour" label="Max detour km" value={maxDetourKm} onChange={setMaxDetourKm} />
                <NumberField id="plan-interval" label="Preferred interval km" value={intervalKm} onChange={setIntervalKm} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  data-testid="plan-24h"
                  type="checkbox"
                  checked={prefer24h}
                  onChange={(event) => setPrefer24h(event.target.checked)}
                />
                Prefer 24-hour synthetic stations
              </label>
              <Button type="button" data-testid="plan-generate-stops" onClick={() => onPlanStops()}>
                Plan synthetic stops
              </Button>
              {stopPlan ? (
                <div data-testid="plan-stop-results" className="flex flex-col gap-2 text-sm leading-6">
                  <p>{stopPlan.disclaimer}</p>
                  <p data-testid="plan-stop-feasible">
                    {stopPlan.feasible
                      ? "Feasible within the synthetic straight-line limits."
                      : "Not feasible. Unresolved gaps remain."}
                  </p>
                  <p>
                    Route length {stopPlan.routeKm} km. Usable range {stopPlan.usableRangeKm} km.
                    Detour method: {stopPlan.detourMethod}.
                  </p>
                  <ul>
                    {stopPlan.stops.map((stop) => (
                      <li key={`${stop.station.id}-${stop.alongKm}`} data-testid="plan-station">
                        {stop.station.name} at {stop.alongKm} km, detour {stop.detourKm} km. Synthetic.
                      </li>
                    ))}
                  </ul>
                  {stopPlan.gaps.map((gap) => (
                    <p key={gap}>{gap}</p>
                  ))}
                </div>
              ) : null}
            </form>
          ) : (
            <p data-testid="plan-stops-locked">Confirm a candidate before planning stops.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ImportSummary({ parsed }: { parsed: ParsedMapsUrl }) {
  const origin = parsed.stops.find((stop) => stop.role === "origin");
  const destination = parsed.stops.find((stop) => stop.role === "destination");
  const middle = parsed.stops.filter((stop) => stop.role === "waypoint" || stop.role === "via");
  const avoid = (["tolls", "highways", "ferries"] as const)
    .filter((flag) => parsed.avoid[flag] === true);
  return (
    <div className="grid gap-2 text-sm leading-6" data-testid="plan-import-summary">
      <p data-testid="plan-origin">Origin: {origin ? stopTitle(origin) : "missing"}</p>
      <ol data-testid="plan-waypoints">
        {middle.map((stop, index) => (
          <li key={`${stop.role}-${index}`}>
            {index + 1}. {stop.role} {stopTitle(stop)}
          </li>
        ))}
      </ol>
      <p data-testid="plan-destination">Destination: {destination ? stopTitle(destination) : "missing"}</p>
      <p data-testid="plan-preferences">
        Travel mode: {parsed.travelMode ?? "missing"}. Avoid: {avoid.length > 0 ? avoid.join(", ") : "none recovered"}.
      </p>
      <ConstraintNotes parsed={parsed} />
      <p data-testid="plan-missing">
        Missing from the URL: encoded polyline {parsed.encodedPolyline ? "present" : "not encoded"}; route token{" "}
        {parsed.routeToken ? "present" : "not encoded"}. The selected alternative may not be recoverable.
      </p>
      <p className="break-all font-mono text-xs" data-testid="plan-original-url">
        {parsed.inputUrl}
      </p>
    </div>
  );
}

function ConstraintNotes({ parsed }: { parsed: ParsedMapsUrl }) {
  const report = describeRoutingConstraints(parsed);
  if (report.represented.length === 0 && report.unsupported.length === 0) {
    return null;
  }
  return (
    <div data-testid="plan-constraints" className="flex flex-col gap-1">
      {report.represented.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {report.unsupported.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: RouteCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={`plan-candidate-${candidate.id}`}
      onClick={onSelect}
      className={`rounded-xl border p-3 text-left ${selected ? "border-primary" : "border-border"}`}
    >
      <p className="font-medium">{candidate.route.label}</p>
      <p className="text-muted-foreground text-sm">
        {candidate.kind}. {formatDistance(candidate.route.distanceMeters)} · {formatDuration(candidate.route.durationSeconds)}
      </p>
      <p className="text-sm">{candidate.route.description}</p>
      {candidate.route.synthetic ? <Badge data-testid="plan-mock-badge">MOCK</Badge> : <Badge>LIVE</Badge>}
    </button>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        data-testid={id}
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}

function schematicReconstruction(
  reconstruction: ReconstructionResult,
  visibleIds: string[],
): ReconstructionResult {
  const visible = new Set(visibleIds);
  const routes = reconstruction.routes
    .filter((route) => visible.has(route.id))
    .map((route) =>
      reconstruction.mock
        ? route
        : {
            ...route,
            encodedPolyline: null,
          },
    );
  return { ...reconstruction, routes };
}
