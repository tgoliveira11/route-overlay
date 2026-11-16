import type { GeoPoint, TravelMode } from "@/lib/route-overlay/types";

export interface SampleFixtureStop {
  label: string;
  location: GeoPoint;
}

/**
 * Clickable local examples. Fixture coordinates are used only by mock
 * reconstruction when the URL itself has place names and no coordinates.
 * They are not presented as data recovered from Google.
 */
export interface SampleRoute {
  id: string;
  title: string;
  description: string;
  url: string;
  expected: {
    origin: string;
    destination: string;
    waypoints: string[];
    travelMode: TravelMode;
    coordinateCount: number;
  };
  fixture: SampleFixtureStop[] | null;
  fixtureNote: string | null;
}

export const SAMPLES: SampleRoute[] = [
  {
    id: "congonhas-masp",
    title: "Maps URLs API, names only",
    description:
      "Congonhas Airport to MASP with a stop at Mercado Municipal. Documented query parameters, no geometry.",
    url: "https://www.google.com/maps/dir/?api=1&origin=Congonhas+Airport,+S%C3%A3o+Paulo&destination=MASP,+Avenida+Paulista,+S%C3%A3o+Paulo&waypoints=Mercado+Municipal+de+S%C3%A3o+Paulo&travelmode=driving",
    expected: {
      origin: "Congonhas Airport, São Paulo",
      destination: "MASP, Avenida Paulista, São Paulo",
      waypoints: ["Mercado Municipal de São Paulo"],
      travelMode: "driving",
      coordinateCount: 0,
    },
    fixture: [
      {
        label: "Congonhas Airport, São Paulo",
        location: { latitude: -23.6261, longitude: -46.6563 },
      },
      {
        label: "Mercado Municipal de São Paulo",
        location: { latitude: -23.5415, longitude: -46.6296 },
      },
      {
        label: "MASP, Avenida Paulista, São Paulo",
        location: { latitude: -23.5614, longitude: -46.6558 },
      },
    ],
    fixtureNote:
      "Map coordinates come from a local sample fixture because this URL contains only place names. They were not recovered from the link and they are not a Google response.",
  },
  {
    id: "vila-madalena-santos",
    title: "Directions path with coordinates",
    description:
      "Vila Madalena to Santos. Stop names are in the path and coordinates are in the data blob.",
    url: "https://www.google.com/maps/dir/Vila+Madalena,+S%C3%A3o+Paulo/Santos,+SP/@-23.75,-46.55,10z/data=!3m1!4b1!4m14!4m13!1m5!1m1!1s0x94ce57:0x1!2m2!1d-46.6918!2d-23.5534!1m5!1m1!1s0x94ce1:0x2!2m2!1d-46.3336!2d-23.9608!3e0",
    expected: {
      origin: "Vila Madalena, São Paulo",
      destination: "Santos, SP",
      waypoints: [],
      travelMode: "driving",
      coordinateCount: 2,
    },
    fixture: null,
    fixtureNote: null,
  },
  {
    id: "via-masp-congonhas",
    title: "Via point, coordinates in the query",
    description:
      "MASP to Congonhas forced through one via coordinate. The corridor is constrained. The selected alternative is still not identified.",
    url: "https://www.google.com/maps/dir/?api=1&origin=-23.5614,-46.6558&destination=-23.6261,-46.6563&waypoints=via:-23.5900,-46.6400&travelmode=driving",
    expected: {
      origin: "-23.5614, -46.6558",
      destination: "-23.6261, -46.6563",
      waypoints: ["-23.5900, -46.6400"],
      travelMode: "driving",
      coordinateCount: 3,
    },
    fixture: null,
    fixtureNote: null,
  },
  {
    id: "pinheiros-ibirapuera",
    title: "google.com.br path, walking",
    description:
      "Pinheiros to Ibirapuera. Travel mode is only an observed data-blob enum, and the URL has no coordinates.",
    url: "https://www.google.com.br/maps/dir/Pinheiros,+S%C3%A3o+Paulo/Ibirapuera+Park,+S%C3%A3o+Paulo/data=!3m1!4b1!4m2!4m1!3e2",
    expected: {
      origin: "Pinheiros, São Paulo",
      destination: "Ibirapuera Park, São Paulo",
      waypoints: [],
      travelMode: "walking",
      coordinateCount: 0,
    },
    fixture: null,
    fixtureNote: null,
  },
];

export function findSample(url: string): SampleRoute | null {
  const trimmed = url.trim();
  return SAMPLES.find((sample) => sample.url === trimmed) ?? null;
}
