"use client";

import { useEffect, useRef, useState } from "react";

interface GoogleRouteMapProps {
  apiKey: string;
  /** Newline-joined encoded polylines. A string keeps the effect dependency stable. */
  encodedJoined: string;
  onReady: (ready: boolean) => void;
}

/**
 * Draws live Routes API polylines on a Google map.
 * The parent must render this only after the Maps JavaScript API is explicitly enabled.
 * https://developers.google.com/maps/documentation/javascript/shapes#polylines
 */
export function GoogleRouteMap({ apiKey, encodedJoined, onReady }: GoogleRouteMapProps) {
  const host = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const [failed, setFailed] = useState(false);
  onReadyRef.current = onReady;

  useEffect(() => {
    let cancelled = false;
    onReadyRef.current(false);
    setFailed(false);
    loadGoogleMaps(apiKey)
      .then((maps) => {
        if (cancelled || !host.current) {
          return;
        }
        drawPolylines(maps, host.current, encodedJoined.split("\n").filter(Boolean));
        onReadyRef.current(true);
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          onReadyRef.current(false);
        }
      });
    return () => {
      cancelled = true;
      onReadyRef.current(false);
    };
  }, [apiKey, encodedJoined]);

  return (
    <div className="flex flex-col gap-2">
      <div ref={host} className="h-72 w-full rounded-xl border" data-testid="plan-google-map" />
      {failed ? (
        <p data-testid="plan-google-map-error">
          Google Maps did not load. Live geometry stays unconfirmed.
        </p>
      ) : null}
    </div>
  );
}

interface GoogleMapsNamespace {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => {
    fitBounds: (bounds: GoogleBounds) => void;
  };
  Polyline: new (options: Record<string, unknown>) => unknown;
  LatLngBounds: new () => GoogleBounds;
  geometry: {
    encoding: {
      decodePath: (encoded: string) => Array<{ lat: () => number; lng: () => number }>;
    };
  };
}

interface GoogleBounds {
  extend: (point: { lat: () => number; lng: () => number }) => void;
}

declare global {
  interface Window {
    google?: { maps?: GoogleMapsNamespace };
  }
}

const loads = new Map<string, Promise<GoogleMapsNamespace>>();

function loadGoogleMaps(apiKey: string): Promise<GoogleMapsNamespace> {
  const existing = loads.get(apiKey);
  if (existing) {
    return existing;
  }
  const pending = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    if (window.google?.maps?.geometry?.encoding) {
      resolve(window.google.maps);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=geometry`;
    script.async = true;
    script.onload = () => {
      if (window.google?.maps?.geometry?.encoding) {
        resolve(window.google.maps);
        return;
      }
      reject(new Error("Google Maps loaded without geometry."));
    };
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.appendChild(script);
  });
  loads.set(apiKey, pending);
  return pending;
}

function drawPolylines(maps: GoogleMapsNamespace, element: HTMLElement, polylines: string[]) {
  const bounds = new maps.LatLngBounds();
  const map = new maps.Map(element, {
    mapTypeControl: false,
    streetViewControl: false,
  });
  polylines.forEach((encoded, index) => {
    const path = maps.geometry.encoding.decodePath(encoded);
    path.forEach((point) => bounds.extend(point));
    new maps.Polyline({
      map,
      path,
      strokeColor: index === 0 ? "#1a73e8" : "#e37400",
      strokeWeight: index === 0 ? 5 : 3,
    });
  });
  if (polylines.length > 0) {
    map.fitBounds(bounds);
  }
}
