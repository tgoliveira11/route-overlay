import { normalizeCnpj } from "@/lib/route-overlay/stations/cnpj";
import type { AnpApiProduct, AnpApiRecord } from "@/lib/route-overlay/stations/types";

export class AnpApiError extends Error {
  readonly status: number | null;
  readonly kind: "blocked" | "rate_limit" | "unavailable" | "invalid";

  constructor(kind: AnpApiError["kind"], message: string, status: number | null = null) {
    super(message);
    this.name = "AnpApiError";
    this.kind = kind;
    this.status = status;
  }
}

export interface AnpApiPage {
  records: AnpApiRecord[];
  page: number;
  totalRecords: number;
  totalPages: number;
}

const ENDPOINT = "https://revendedoresapi.anp.gov.br/v1/combustivel";

export function parseAnpApiPayload(payload: unknown): AnpApiPage {
  if (!payload || typeof payload !== "object") {
    throw new AnpApiError("invalid", "ANP response was not a JSON object.");
  }
  const body = payload as Record<string, unknown>;
  if (body.succeeded === false) {
    throw new AnpApiError("invalid", "ANP reported that the query did not succeed.");
  }
  if (!Array.isArray(body.data)) {
    throw new AnpApiError("invalid", "ANP response did not include a data array.");
  }
  const filter = isRecord(body.searchPageFilter) ? body.searchPageFilter : {};
  return {
    records: body.data.map(parseRecord),
    page: numberOr(filter.numeroPagina, 1),
    totalRecords: numberOr(filter.totalRegistro, body.data.length),
    totalPages: numberOr(filter.totalPagina, 1),
  };
}

export async function fetchAnpMunicipalityPage(
  input: { uf: string; municipio: string; page?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<AnpApiPage> {
  const url = new URL(ENDPOINT);
  url.searchParams.set("uf", input.uf);
  url.searchParams.set("municipio", input.municipio);
  url.searchParams.set("numeropagina", String(input.page ?? 1));
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "network failure";
    throw new AnpApiError("unavailable", `ANP request failed: ${message}`);
  }
  if (response.status === 429) {
    throw new AnpApiError("rate_limit", "ANP rate limit response. No retry was sent.", 429);
  }
  if (response.status === 403) {
    throw new AnpApiError("blocked", "ANP blocked the request. No bypass was attempted.", 403);
  }
  if (!response.ok) {
    throw new AnpApiError("unavailable", `ANP returned HTTP ${response.status}.`, response.status);
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new AnpApiError("invalid", "ANP response was not JSON.", response.status);
  }
  return parseAnpApiPayload(payload);
}

function parseRecord(value: unknown): AnpApiRecord {
  const record = isRecord(value) ? value : {};
  const products = Array.isArray(record.produtos) ? record.produtos.map(parseProduct) : [];
  return {
    codigoSimp: text(record.codigoSIMP),
    autorizacao: text(record.autorizacao),
    dataPublicacao: text(record.dataPublicacao),
    razaoSocial: text(record.razaoSocial),
    cnpj: normalizeCnpj(text(record.cnpj)),
    endereco: text(record.endereco),
    complemento: text(record.complemento),
    bairro: text(record.bairro),
    cep: text(record.cep),
    uf: text(record.uf).toUpperCase(),
    municipio: text(record.municipio),
    distribuidora: text(record.distribuidora),
    dataVinculacao: text(record.dataVinculacao),
    produtos: products,
    latitude: decimal(record.latitude),
    longitude: decimal(record.longitude),
    coordinateText: {
      latitude: text(record.latitude),
      longitude: text(record.longitude),
    },
    validationText: text(record.validacao),
    accuracyText: text(record.estimativaAcuracia),
    obtainedOn: text(record.dataObtencao),
    informationOrigin: text(record.origemInformacao),
    sigafStatus: text(record.statusSIGAF),
  };
}

function parseProduct(value: unknown): AnpApiProduct {
  const product = isRecord(value) ? value : {};
  return {
    produto: text(product.produto),
    tancagem: decimal(product.tancagem),
    unidMedidaTancagem: text(product.unidMedidaTancagem),
    qtdeBicos: decimal(product.qtdeBicos),
  };
}

function decimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const parsed = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
