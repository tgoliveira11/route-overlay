"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistance, formatDuration } from "@/lib/route-overlay/geo";

export interface GoogleMapRoute {
  id: string;
  label: string;
  encodedPolyline: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

export interface GoogleMapStop {
  label: string;
  role: string;
  latitude: number;
  longitude: number;
}

interface GoogleRouteMapProps {
  apiKey: string;
  routes: GoogleMapRoute[];
  stops: GoogleMapStop[];
  selectedRouteId: string | null;
  onReady: (ready: boolean) => void;
}

const PALETTE = ["#1a73e8", "#e37400", "#188038", "#a142f4", "#d93025"];

/**
 * Draws live Routes API polylines on an official Google map.
 * Switching the selected candidate restyles the existing map and does not
 * call computeRoutes or create another map load.
 */
export function GoogleRouteMap({
  apiKey,
  routes,
  stops,
  selectedRouteId,
  onReady,
}: GoogleRouteMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const selectedRef = useRef(selectedRouteId);
  const routesRef = useRef(routes);
  const drawnRef = useRef<Map<string, GooglePolyline>>(new Map());
  const stopsRef = useRef(stops);
  const drawToken = useRef(0);
  const [failed, setFailed] = useState<string | null>(null);
  onReadyRef.current = onReady;
  selectedRef.current = selectedRouteId;
  routesRef.current = routes;
  stopsRef.current = stops;

  const geometryKey = routes
    .map((route) => `${route.id}\t${route.encodedPolyline ?? ""}`)
    .join("\n");
  const stopsKey = stops
    .map((stop) => `${stop.role}:${stop.latitude},${stop.longitude}:${stop.label}`)
    .join("|");
  const selected = routes.find((route) => route.id === selectedRouteId) ?? null;

  useEffect(() => {
    const token = ++drawToken.current;
    let cancelled = false;
    drawnRef.current.clear();
    onReadyRef.current(false);
    setFailed(null);
    if (!apiKey.trim()) {
      setFailed("Google Maps credentials are missing. Live geometry stays unconfirmed.");
      return;
    }
    const isCurrent = () => !cancelled && drawToken.current === token;
    void (async () => {
      // Yield once so a discarded strict-mode setup does not reserve a map load.
      await Promise.resolve();
      if (!isCurrent()) {
        return;
      }
      try {
        const renderedId = await drawMap({
          apiKey,
          host: host.current,
          routes: routesRef.current,
          stops: stopsRef.current,
          selectedRouteId: selectedRef.current,
          drawn: drawnRef.current,
          isCurrent,
        });
        if (!isCurrent()) {
          return;
        }
        onReadyRef.current(renderedId !== null && renderedId === selectedRef.current);
      } catch (error: unknown) {
        if (!isCurrent()) {
          return;
        }
        drawnRef.current.clear();
        setFailed(error instanceof Error ? error.message : "Google Maps did not load.");
        onReadyRef.current(false);
      }
    })();
    return () => {
      cancelled = true;
      onReadyRef.current(false);
    };
  }, [apiKey, geometryKey, stopsKey]);

  useEffect(() => {
    if (drawnRef.current.size === 0) {
      return;
    }
    const renderedId = styleRoutes(drawnRef.current, routes, selectedRouteId);
    onReady(renderedId !== null && renderedId === selectedRouteId);
  }, [routes, selectedRouteId, onReady]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={host} className="h-72 w-full rounded-xl border" data-testid="plan-google-map" />
      <p data-testid="plan-google-map-summary">
        {selected
          ? `${selected.label}: ${formatDistance(selected.distanceMeters)}, ${formatDuration(selected.durationSeconds)}`
          : "No candidate is selected."}
      </p>
      {failed ? <p data-testid="plan-google-map-error">{failed}</p> : null}
    </div>
  );
}

interface DrawInput {
  apiKey: string;
  host: HTMLDivElement | null;
  routes: GoogleMapRoute[];
  stops: GoogleMapStop[];
  selectedRouteId: string | null;
  drawn: Map<string, GooglePolyline>;
  isCurrent: () => boolean;
}

async function drawMap(input: DrawInput): Promise<string | null> {
  if (!input.isCurrent()) {
    return null;
  }
  const reservation = await fetch("/api/routes/map-load", { method: "POST" });
  if (!input.isCurrent()) {
    return null;
  }
  const body = (await reservation.json()) as { allowed?: boolean; reason?: string | null };
  if (!reservation.ok || body.allowed !== true) {
    throw new Error(body.reason ?? "Google map load was refused by the local cap.");
  }
  const maps = await loadGoogleMaps(input.apiKey);
  if (!input.isCurrent()) {
    return null;
  }
  if (!input.host) {
    throw new Error("Google Maps did not find a container.");
  }
  const bounds = new maps.LatLngBounds();
  const map = new maps.Map(input.host, {
    mapTypeControl: false,
    streetViewControl: false,
  });
  input.drawn.clear();
  for (const [index, route] of input.routes.entries()) {
    if (!route.encodedPolyline) {
      continue;
    }
    let path: GoogleLatLng[];
    try {
      path = maps.geometry.encoding.decodePath(route.encodedPolyline);
    } catch {
      continue;
    }
    if (path.length === 0) {
      continue;
    }
    path.forEach((point) => bounds.extend(point));
    const polyline = new maps.Polyline({
      map,
      path,
      strokeColor: PALETTE[index % PALETTE.length],
      strokeWeight: 4,
      zIndex: index + 1,
    });
    input.drawn.set(route.id, polyline);
  }
  input.stops.forEach((stop) => {
    const position = { lat: stop.latitude, lng: stop.longitude };
    bounds.extend(position);
    new maps.Marker({
      map,
      position,
      title: stop.label,
      label: markerLabel(stop.role),
    });
  });
  if (input.drawn.size > 0 || input.stops.length > 0) {
    map.fitBounds(bounds);
  }
  return styleRoutes(input.drawn, input.routes, input.selectedRouteId);
}

function styleRoutes(
  drawn: Map<string, GooglePolyline>,
  routes: GoogleMapRoute[],
  selectedRouteId: string | null,
): string | null {
  let renderedId: string | null = null;
  routes.forEach((route, index) => {
    const polyline = drawn.get(route.id);
    if (!polyline || !route.encodedPolyline) {
      return;
    }
    const selected = route.id === selectedRouteId;
    polyline.setOptions({
      strokeColor: selected ? "#1a73e8" : PALETTE[index % PALETTE.length],
      strokeWeight: selected ? 7 : 4,
      strokeOpacity: selected ? 1 : 0.7,
      zIndex: selected ? 20 : index + 1,
    });
    if (selected) {
      renderedId = route.id;
    }
  });
  return renderedId;
}

function markerLabel(role: string): string {
  if (role === "origin") {
    return "A";
  }
  if (role === "destination") {
    return "B";
  }
  return "•";
}

interface GoogleLatLng {
  lat: () => number;
  lng: () => number;
}

interface GooglePolyline {
  setOptions: (options: Record<string, unknown>) => void;
}

interface GoogleBounds {
  extend: (point: GoogleLatLng | { lat: number; lng: number }) => void;
}

interface GoogleMapInstance {
  fitBounds: (bounds: GoogleBounds) => void;
}

interface GoogleMapsNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance;
  Polyline: new (options: Record<string, unknown>) => GooglePolyline;
  Marker: new (options: Record<string, unknown>) => unknown;
  LatLngBounds: new () => GoogleBounds;
  geometry: {
    encoding: {
      decodePath: (encoded: string) => GoogleLatLng[];
    };
  };
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsNamespace };
    gm_authFailure?: () => void;
  }
}

const loads = new Map<string, Promise<GoogleMapsNamespace>>();

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  const existing = loads.get(apiKey);
  if (existing) {
    return existing;
  }
  const pending = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    window.gm_authFailure = () => {
      reject(new Error("Google Maps rejected the browser key, billing, or quota. Live geometry stays unconfirmed."));
    };
    if (window.google?.maps?.geometry?.encoding && window.google.maps.Map) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps?.geometry?.encoding && window.google.maps.Map) {
        resolve(window.google.maps);
        return;
      }
      reject(new Error("Google Maps loaded without geometry."));
    };
    script.onerror = () => reject(new Error("Google Maps did not load. Live geometry stays unconfirmed."));
    document.head.appendChild(script);
  });
  loads.set(apiKey, pending);
  pending.catch(() => {
    loads.delete(apiKey);
  });
  return pending;
}
