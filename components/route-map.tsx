import { decodePolyline } from "@/lib/route-overlay/polyline";
import type {
  GeoPoint,
  ParsedMapsUrl,
  ReconstructionResult,
} from "@/lib/route-overlay/types";
import { stopTitle } from "@/lib/route-overlay/geo";

interface RouteMapProps {
  parsed: ParsedMapsUrl;
  reconstruction: ReconstructionResult;
  /** When set, that candidate is drawn as the selected corridor. */
  highlightRouteId?: string | null;
}

export function RouteMap({ parsed, reconstruction, highlightRouteId = null }: RouteMapProps) {
  const drawn = reconstruction.routes.flatMap((route) => {
    if (!route.encodedPolyline) {
      return [];
    }
    return [
      {
        id: route.id,
        label: route.label,
        points: decodePolyline(route.encodedPolyline),
        primary: highlightRouteId ? route.id === highlightRouteId : route.isDefaultAlternative,
        synthetic: route.synthetic,
      },
    ];
  });
  const sourcePoints = reconstruction.sourcePolyline
    ? decodePolyline(reconstruction.sourcePolyline.encodedPolyline)
    : [];
  const markerPoints = reconstruction.mapStops.map((stop) => stop.location);
  const boundsPoints = [
    ...drawn.flatMap((route) => route.points),
    ...sourcePoints,
    ...markerPoints,
  ];

  if (boundsPoints.length < 2) {
    return <StopSequence parsed={parsed} />;
  }

  const project = projector(boundsPoints);
  const markerPositions = reconstruction.mapStops.map((stop) => ({
    ...stop,
    ...project(stop.location),
  }));

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-[#101612]">
      <svg
        viewBox="0 0 800 480"
        role="img"
        aria-label="Schematic map of the reconstructed corridor"
        className="h-auto w-full"
      >
        <rect width="800" height="480" fill="#101612" />
        {gridLines()}
        {sourcePoints.length > 1 ? (
          <polyline
            fill="none"
            stroke="#3dbe9a"
            strokeWidth="4"
            points={sourcePoints.map((point) => xy(project(point))).join(" ")}
          />
        ) : null}
        {drawn.map((route) => (
          <polyline
            key={route.id}
            fill="none"
            stroke={route.primary ? "#e3a008" : "#d07a4a"}
            strokeWidth={route.primary ? 4 : 3}
            strokeDasharray={route.synthetic ? "7 6" : undefined}
            points={route.points.map((point) => xy(project(point))).join(" ")}
          />
        ))}
        {markerPositions.map((stop, index) => (
          <g key={`${stop.role}-${index}`}>
            <circle cx={stop.x} cy={stop.y} r="11" fill="#f4efe2" />
            <text
              x={stop.x}
              y={stop.y + 4}
              textAnchor="middle"
              fontSize="11"
              fontFamily="IBM Plex Mono, ui-monospace, monospace"
              fill="#1a211c"
            >
              {index + 1}
            </text>
          </g>
        ))}
        {reconstruction.mock ? (
          <text
            x="24"
            y="36"
            fill="#e3a008"
            fontSize="14"
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
            letterSpacing="1.5"
          >
            MOCK GEOMETRY
          </text>
        ) : (
          <text
            x="24"
            y="36"
            fill="#3dbe9a"
            fontSize="14"
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
            letterSpacing="1.5"
          >
            GOOGLE ROUTES GEOMETRY
          </text>
        )}
      </svg>
      <figcaption className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 px-3 py-2 font-mono text-[11px]">
        <span>Amber dashed line: reconstructed alternative</span>
        {reconstruction.sourcePolyline ? (
          <span>Teal line: polyline copied from the URL</span>
        ) : null}
        <span>Not a navigational chart</span>
      </figcaption>
    </figure>
  );
}

function StopSequence({ parsed }: { parsed: ParsedMapsUrl }) {
  if (parsed.stops.length === 0) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed border-border px-4 py-8 text-sm">
        No stops were recovered, so there is nothing to draw.
      </p>
    );
  }
  return (
    <ol className="space-y-3 rounded-xl border border-dashed border-border px-4 py-4">
      {parsed.stops.map((stop, index) => (
        <li key={`${stop.role}-${index}`} className="flex gap-3">
          <span className="bg-primary text-primary-foreground flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs">
            {index + 1}
          </span>
          <span>
            <span className="text-muted-foreground block font-mono text-[11px] tracking-wide uppercase">
              {stop.role}
            </span>
            <span className="text-sm">{stopTitle(stop)}</span>
          </span>
        </li>
      ))}
      <li className="text-muted-foreground text-sm">
        No coordinates were available, so the console did not invent a map line.
      </li>
    </ol>
  );
}

function projector(points: GeoPoint[]): (point: GeoPoint) => { x: number; y: number } {
  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const width = 800;
  const height = 480;
  const pad = 0.14;
  return (point) => ({
    x: width * pad + ((point.longitude - minLng) / lngSpan) * width * (1 - pad * 2),
    y: height * pad + ((maxLat - point.latitude) / latSpan) * height * (1 - pad * 2),
  });
}

function xy(point: { x: number; y: number }): string {
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function gridLines() {
  const lines = [];
  for (let x = 40; x < 800; x += 40) {
    lines.push(
      <line
        key={`v-${x}`}
        x1={x}
        y1="0"
        x2={x}
        y2="480"
        stroke="#e7e1d1"
        strokeOpacity="0.06"
      />,
    );
  }
  for (let y = 40; y < 480; y += 40) {
    lines.push(
      <line
        key={`h-${y}`}
        x1="0"
        y1={y}
        x2="800"
        y2={y}
        stroke="#e7e1d1"
        strokeOpacity="0.06"
      />,
    );
  }
  return lines;
}
