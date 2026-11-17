import type { GeoPoint } from "@/lib/route-overlay/types";

/**
 * Gasoline classes stay separate. Additive gasoline is not premium gasoline,
 * and a brand name is not evidence of Petrobras Podium.
 */
export type GasolineClass =
  | "REGULAR_GASOLINE"
  | "ADDITIVE_GASOLINE"
  | "PREMIUM_GASOLINE"
  | "PODIUM_SPECIFIC"
  | "UNKNOWN";

export type MatchDecision =
  | "MATCH_CONFIRMED"
  | "MATCH_REVIEW_REQUIRED"
  | "MATCH_REJECTED"
  | "MATCH_NOT_FOUND";

export type Confidence = "HIGH" | "MEDIUM" | "LOW" | "MISSING" | "UNKNOWN" | "CONFLICTING";

export interface ClassifiedProduct {
  raw: string;
  classification: GasolineClass | "NOT_GASOLINE";
}

export interface AnpCsvRecord {
  codigoIsimp: string;
  autorizacao: string;
  dataPublicacao: string;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  bandeira: string;
  dataVinculacao: string;
}

export interface AnpApiProduct {
  produto: string;
  tancagem: number | null;
  unidMedidaTancagem: string;
  qtdeBicos: number | null;
}

export interface AnpApiRecord {
  codigoSimp: string;
  autorizacao: string;
  dataPublicacao: string;
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  complemento: string;
  bairro: string;
  cep: string;
  uf: string;
  municipio: string;
  distribuidora: string;
  dataVinculacao: string;
  produtos: AnpApiProduct[];
  latitude: number | null;
  longitude: number | null;
  coordinateText: { latitude: string; longitude: string };
  validationText: string;
  accuracyText: string;
  obtainedOn: string;
  informationOrigin: string;
  sigafStatus: string;
}

export interface RouteProvenance {
  /** Cached Google default, not the unpersisted browser confirmation. */
  label: "cached_google_default_route";
  scenarioId: "A";
  candidateId: "google-1";
  description: string;
  distanceMeters: number;
  durationSeconds: number;
  pointCount: number;
  confirmedGeometryAvailable: false;
  fidelity: "UNVERIFIED";
}

export interface StationObservation {
  cnpj: string;
  codigoSimp: string;
  razaoSocial: string;
  endereco: string;
  municipio: string;
  uf: string;
  bandeira: string;
  products: ClassifiedProduct[];
  premium: boolean;
  podiumText: boolean;
  location: GeoPoint | null;
  locationQuality: Confidence;
  coordinateSource: "anp_api" | "missing";
  validationText: string;
  obtainedOn: string;
  informationOrigin: string;
  sigafStatus: string;
  distanceToRouteMeters: number | null;
  progressMeters: number | null;
  band: "0_2_km" | "2_5_km" | "outside" | "ungeolocated";
  longSegment: boolean;
  duplicateCnpj: boolean;
  duplicateLocation: boolean;
  identityConfidence: Confidence;
  premiumConfidence: Confidence;
  freshness: Confidence;
}

export interface PublicStation {
  cnpj: string;
  razaoSocial: string;
  municipio: string;
  uf: string;
  bandeira: string;
  premiumDescriptions: string[];
  latitude: number | null;
  longitude: number | null;
  distanceToRouteMeters: number | null;
  progressMeters: number | null;
  band: StationObservation["band"];
  locationQuality: Confidence;
  validationText: string;
  obtainedOn: string;
  identityConfidence: Confidence;
  sigafStatus: string;
}

export interface CoverageGap {
  fromProgressMeters: number;
  toProgressMeters: number;
  lengthMeters: number;
}

export interface PlacesSampleSummary {
  requested: number;
  matchConfirmed: number;
  reviewRequired: number;
  rejected: number;
  notFound: number;
  regularHoursReturned: number;
  currentHoursReturned: number;
  hoursCrossChecked: number;
  hoursConflicting: number;
  hoursMissing: number;
  sku: "Places API Text Search Enterprise";
  fieldMask: string;
  estimatedWorstCaseUsd: number;
  observedCostUsd: null;
}

export interface CoverageSummary {
  generatedAt: string;
  route: RouteProvenance & {
    brazilianPointCount: number;
    brazilianLengthMeters: number;
    borderApproachMeters: number;
    borderClipReliable: boolean;
    longSegmentCount: number;
  };
  sources: {
    csvUrl: string;
    csvSha256: string;
    csvBytes: number;
    csvEncoding: string;
    csvPublishedLabel: string;
    csvRetrievedAt: string;
    apiUrl: string;
    apiRetrievedAt: string | null;
    apiBlockedFromLocalNetwork: boolean;
  };
  population: {
    nationalCsvRecords: number;
    corridorMunicipalities: number;
    registeredInCorridorMunicipalities: number;
    apiRecordsInCorridorMunicipalities: number;
    apiPagesRetrieved: number;
    premiumExplicit: number;
    podiumText: number;
    premiumWithCoordinates: number;
    premiumWithin2Km: number;
    premiumBetween2And5Km: number;
    premiumUngeolocated: number;
    anyFuelWithin2Km: number;
    anyFuelBetween2And5Km: number;
    coordinateConflicts: number;
    duplicateCnpj: number;
    duplicateLocation: number;
    sigafMarked: number;
  };
  byState: Array<{ uf: string; registered: number; apiRecords: number; premium: number; premiumWithin5Km: number }>;
  byBrand: Array<{ brand: string; premium: number; premiumWithin5Km: number }>;
  gapsOver100Km: CoverageGap[];
  representativeStations: PublicStation[];
  corridorPremiumStations: PublicStation[];
  places: PlacesSampleSummary | null;
  limitations: string[];
}
