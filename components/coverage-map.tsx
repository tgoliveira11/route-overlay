"use client";

import { useEffect, useRef, useState } from "react";
import type { PublicStation } from "@/lib/route-overlay/stations/types";

/**
 * Plots ANP coordinates on a Google map. It does not draw a Routes polyline
 * and it does not export the markers.
 */
export function CoverageMap({ stations }: { stations: PublicStation[] }) {
  const host = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("Checking whether a Google map is available.");

  useEffect(() => {
    let cancelled = false;
    const plotted = stations.filter((station) => station.latitude !== null && station.longitude !== null);
    void (async () => {
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      const statusResponse = await fetch("/api/routes/status");
      if (!statusResponse.ok) {
        if (!cancelled) {
          setMessage("Map status is unavailable. Station counts above do not depend on the map.");
        }
        return;
      }
      const status = (await statusResponse.json()) as { mapsDisplayAvailable?: boolean; mapsJsKey?: string | null };
      if (!status.mapsDisplayAvailable || !status.mapsJsKey) {
        if (!cancelled) {
          setMessage("Google map display is off. ANP coordinates are listed in the table and are not drawn.");
        }
        return;
      }
      const reservation = await fetch("/api/stations/map-load", { method: "POST" });
      const body = (await reservation.json()) as { allowed: boolean; reason: string | null };
      if (!body.allowed) {
        if (!cancelled) {
          setMessage(body.reason ?? "The coverage map was not loaded.");
        }
        return;
      }
      if (cancelled || !host.current) {
        return;
      }
      const maps = await loadMaps(status.mapsJsKey);
      if (cancelled || !host.current) {
        return;
      }
      const map = new maps.Map(host.current, { center: { lat: -28.5, lng: -50 }, zoom: 6, mapTypeControl: false });
      const bounds = new maps.LatLngBounds();
      plotted.forEach((station) => {
        const position = positionFromStation(station);
        if (!position) {
          return;
        }
        bounds.extend(position);
        new maps.Marker({ map, position, title: `${station.razaoSocial} (${station.municipio})` });
      });
      if (plotted.length > 0) {
        map.fitBounds(bounds);
      }
      if (!cancelled) {
        setMessage(`${plotted.length} premium stations with a route distance are shown from ANP coordinates.`);
      }
    })().catch(() => {
      if (!cancelled) {
        setMessage("The Google map did not load. No further map request was sent.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [stations]);

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" data-testid="coverage-map-status">{message}</p>
      <div ref={host} className="h-80 w-full rounded-md border border-border bg-muted/30" data-testid="coverage-map" />
    </div>
  );
}

function positionFromStation(station: PublicStation): { lat: number; lng: number } | null {
  if (station.latitude === null || station.longitude === null) {
    return null;
  }
  return { lat: station.latitude, lng: station.longitude };
}

interface CoverageMapsNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => { fitBounds: (bounds: { extend: (point: { lat: number; lng: number }) => void }) => void };
  Marker: new (options: Record<string, unknown>) => unknown;
  LatLngBounds: new () => { extend: (point: { lat: number; lng: number }) => void };
}

function mapsOnWindow(): CoverageMapsNamespace | undefined {
  const holder = window as unknown as { google?: { maps?: CoverageMapsNamespace } };
  return holder.google?.maps;
}

const loads = new Map<string, Promise<CoverageMapsNamespace>>();

function loadMaps(apiKey: string): Promise<CoverageMapsNamespace> {
  const existing = loads.get(apiKey);
  if (existing) {
    return existing;
  }
  const pending = new Promise<CoverageMapsNamespace>((resolve, reject) => {
    const ready = mapsOnWindow();
    if (ready?.Map) {
      resolve(ready);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => {
      const loaded = mapsOnWindow();
      if (loaded?.Map) {
        resolve(loaded);
        return;
      }
      reject(new Error("Google Maps loaded without a map constructor."));
    };
    script.onerror = () => reject(new Error("Google Maps did not load."));
    document.head.appendChild(script);
  });
  loads.set(apiKey, pending);
  pending.catch(() => loads.delete(apiKey));
  return pending;
}
