import { describe, expect, it, vi } from "vitest";
import { fetchAnpMunicipalityPage, parseAnpApiPayload } from "@/lib/route-overlay/stations/anp-api";
import { memoryPhase5BudgetStore, reservePhase5Call } from "@/lib/route-overlay/stations/budget";
import { classifyFuelDescription } from "@/lib/route-overlay/stations/classify";
import { isValidCnpj, normalizeCnpj } from "@/lib/route-overlay/stations/cnpj";
import { parseAnpCoordinate } from "@/lib/route-overlay/stations/coordinates";
import { AnpCsvSchemaError, parseAnpCsv } from "@/lib/route-overlay/stations/csv";
import { findDuplicateCnpjs, findDuplicateLocations } from "@/lib/route-overlay/stations/identity";
import { crossCheckHours, interpretOpeningHours } from "@/lib/route-overlay/stations/hours";
import { matchPlaceCandidate } from "@/lib/route-overlay/stations/places-match";
import { lookupStationPlace, redact } from "@/lib/route-overlay/stations/places-client";
import { clipAtNearest, corridorBand, projectOntoPolyline } from "@/lib/route-overlay/stations/proximity";
import { observeStations } from "@/lib/route-overlay/stations/report";
import type { AnpApiRecord } from "@/lib/route-overlay/stations/types";

const encoder = new TextEncoder();

describe("ANP CSV", () => {
  it("parses semicolon rows and normalizes the CNPJ", () => {
    const csv = [
      "CODIGOISIMP;AUTORIZACAO;DATAPUBLICACAO;RAZAOSOCIAL;CNPJ;ENDERECO;COMPLEMENTO;BAIRRO;CEP;UF;MUNICIPIO;BANDEIRA;DATAVINCULACAO",
      "1;PR/RS1;01/01/2020;POSTO EXEMPLO LTDA;05.938.540/0001-34;RUA A, 10;;CENTRO;96300000;rs;JAGUARAO;VIBRA;01/01/2020",
    ].join("\n");
    const parsed = parseAnpCsv(encoder.encode(csv));
    expect(parsed.encoding).toBe("utf-8");
    expect(parsed.records[0].cnpj).toBe("05938540000134");
    expect(parsed.records[0].uf).toBe("RS");
  });

  it("falls back to latin1 when UTF-8 is invalid", () => {
    const header = "CODIGOISIMP;AUTORIZACAO;DATAPUBLICACAO;RAZAOSOCIAL;CNPJ;ENDERECO;COMPLEMENTO;BAIRRO;CEP;UF;MUNICIPIO;BANDEIRA;DATAVINCULACAO\n";
    const row = "1;PR;01/01/2020;POSTO;05938540000134;RUA; ;CENTRO;00000000;RS;SAO JO";
    const bytes = new Uint8Array([...encoder.encode(header), ...encoder.encode(row), 0xe3, ...encoder.encode("O;VIBRA;01/01/2020")]);
    const parsed = parseAnpCsv(bytes);
    expect(parsed.encoding).toBe("latin1");
    expect(parsed.records[0].municipio).toContain("JO");
  });

  it("rejects a changed schema", () => {
    expect(() => parseAnpCsv(encoder.encode("CNPJ;NOME\n1;A"))).toThrow(AnpCsvSchemaError);
  });

  it("warns about an extra column and keeps the known fields", () => {
    const csv = [
      "CODIGOISIMP;AUTORIZACAO;DATAPUBLICACAO;RAZAOSOCIAL;CNPJ;ENDERECO;COMPLEMENTO;BAIRRO;CEP;UF;MUNICIPIO;BANDEIRA;DATAVINCULACAO;NOVO",
      "1;PR;01/01/2020;POSTO;05938540000134;RUA;;CENTRO;00000000;RS;JAGUARAO;VIBRA;01/01/2020;x",
    ].join("\n");
    const parsed = parseAnpCsv(encoder.encode(csv));
    expect(parsed.extraColumns).toEqual(["NOVO"]);
    expect(parsed.records).toHaveLength(1);
  });
});

describe("fuel classification", () => {
  it("keeps additive gasoline distinct from premium gasoline", () => {
    expect(classifyFuelDescription("GASOLINA C COMUM")).toBe("REGULAR_GASOLINE");
    expect(classifyFuelDescription("GASOLINA C COMUM ADITIVADA")).toBe("ADDITIVE_GASOLINE");
    expect(classifyFuelDescription("Gasolina C Premium")).toBe("PREMIUM_GASOLINE");
    expect(classifyFuelDescription("GASOLINA C PREMIUM ADITIVADA")).toBe("PREMIUM_GASOLINE");
    expect(classifyFuelDescription("ÓLEO DIESEL B S10 - COMUM")).toBe("NOT_GASOLINE");
  });

  it("does not treat a brand as Podium and keeps ambiguous gasoline unknown", () => {
    expect(classifyFuelDescription("VIBRA")).toBe("NOT_GASOLINE");
    expect(classifyFuelDescription("GASOLINA PODIUM")).toBe("PODIUM_SPECIFIC");
    expect(classifyFuelDescription("GASOLINA C")).toBe("UNKNOWN");
  });
});

describe("identity and coordinates", () => {
  it("validates CNPJ check digits", () => {
    expect(normalizeCnpj("05.938.540/0001-34")).toBe("05938540000134");
    expect(isValidCnpj("05938540000134")).toBe(true);
    expect(isValidCnpj("05938540000135")).toBe(false);
  });

  it("finds duplicate CNPJs and duplicate locations", () => {
    expect([...findDuplicateCnpjs(["05938540000134", "05.938.540/0001-34"])]).toEqual(["05938540000134"]);
    const duplicates = findDuplicateLocations([
      { id: "a", location: { latitude: -30, longitude: -51 } },
      { id: "b", location: { latitude: -30.0001, longitude: -51 } },
      { id: "c", location: null },
    ]);
    expect(duplicates.has("a")).toBe(true);
    expect(duplicates.has("b")).toBe(true);
    expect(duplicates.has("c")).toBe(false);
  });

  it("rejects missing coordinates and swaps reversed axes", () => {
    expect(parseAnpCoordinate("", "-51", "").quality).toBe("MISSING");
    const swapped = parseAnpCoordinate("-51.2", "-30.1", "");
    expect(swapped.swapped).toBe(true);
    expect(swapped.point).toEqual({ latitude: -30.1, longitude: -51.2 });
    expect(swapped.quality).toBe("LOW");
  });
});

describe("route proximity", () => {
  const route = [
    { latitude: -24, longitude: -47 },
    { latitude: -25, longitude: -48 },
    { latitude: -32.56, longitude: -53.37 },
  ];

  it("clips at the border reference and orders progress from the start", () => {
    const clip = clipAtNearest(route, { latitude: -32.56, longitude: -53.37 });
    expect(clip.clipIndex).toBe(2);
    expect(clip.reliable).toBe(true);
    const nearStart = projectOntoPolyline({ latitude: -24.01, longitude: -47.01 }, clip.points);
    const nearEnd = projectOntoPolyline({ latitude: -32.5, longitude: -53.3 }, clip.points);
    expect(nearStart && nearEnd && nearStart.progressMeters < nearEnd.progressMeters).toBe(true);
  });

  it("bands straight-line distance without calling it a detour", () => {
    const onRoute = projectOntoPolyline({ latitude: -24.5, longitude: -47.5 }, route);
    expect(corridorBand(onRoute?.distanceMeters ?? null)).toBe("0_2_km");
    expect(corridorBand(3_000)).toBe("2_5_km");
    expect(corridorBand(9_000)).toBe("outside");
    expect(corridorBand(null)).toBe("ungeolocated");
  });
});

describe("Places matching and hours", () => {
  const station = {
    name: "AUTO POSTO JORDAN",
    address: "RUA URUGUAI, 468",
    municipality: "JAGUARAO",
    state: "RS",
    location: { latitude: -32.5641, longitude: -53.3826 },
    brand: "VIBRA",
  };

  it("confirms a close candidate and rejects a distant one", () => {
    expect(matchPlaceCandidate(station, null)).toBe("MATCH_NOT_FOUND");
    expect(matchPlaceCandidate(station, {
      id: "p1",
      name: "Jordan",
      formattedAddress: "Rua Uruguai, 468 - Centro, Jaguarão - RS",
      location: { latitude: -32.5642, longitude: -53.3825 },
      businessStatus: "OPERATIONAL",
    })).toBe("MATCH_CONFIRMED");
    expect(matchPlaceCandidate(station, {
      id: "p2",
      name: "Outro Posto",
      formattedAddress: "Montevideo, Uruguay",
      location: { latitude: -34.9, longitude: -56.2 },
      businessStatus: "OPERATIONAL",
    })).toBe("MATCH_REJECTED");
  });

  it("does not treat Google hours as cross-checked", () => {
    const google = interpretOpeningHours({ weekdayDescriptions: ["Monday: Open 24 hours"], periods: [{}] }, "google_regular");
    expect(crossCheckHours(google, null)).toBe("not_cross_checked");
    expect(crossCheckHours(null, null)).toBe("missing");
    expect(crossCheckHours(google, { source: "independent", weekdayDescriptions: ["Monday: 08:00-18:00"], periodCount: 1 })).toBe("conflicting");
  });
});

describe("budgets, errors, and secrets", () => {
  it("does not send a Places request after the cap", async () => {
    const fetchImpl = vi.fn();
    const store = memoryPhase5BudgetStore({ placesRequests: 25, additionalRoutesRequests: 0, mapLoads: 0 });
    const result = await lookupStationPlace({ textQuery: "posto", apiKey: "secret-key" }, store, fetchImpl);
    expect(result.requestSent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("does not retry an ANP rate limit", async () => {
    const fetchImpl = vi.fn(async () => new Response("busy", { status: 429 }));
    await expect(fetchAnpMunicipalityPage({ uf: "RS", municipio: "JAGUARAO" }, fetchImpl)).rejects.toMatchObject({ kind: "rate_limit" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("redacts the server key from an error", () => {
    expect(redact("Places HTTP 400 secret-key denied", "secret-key")).not.toContain("secret-key");
  });

  it("does not increment a denied reservation", () => {
    const store = memoryPhase5BudgetStore({ placesRequests: 25, additionalRoutesRequests: 0, mapLoads: 0 });
    const denied = reservePhase5Call("placesRequests", store);
    expect(denied.allowed).toBe(false);
    expect(store.read().placesRequests).toBe(25);
  });
});

describe("station observations", () => {
  it("keeps a station without coordinates out of the distance bands", () => {
    const record = {
      codigoSimp: "1",
      autorizacao: "PR",
      dataPublicacao: "",
      razaoSocial: "POSTO EXEMPLO LTDA",
      cnpj: "05938540000134",
      endereco: "RUA A",
      complemento: "",
      bairro: "",
      cep: "",
      uf: "RS",
      municipio: "JAGUARAO",
      distribuidora: "VIBRA",
      dataVinculacao: "",
      produtos: [{ produto: "GASOLINA C PREMIUM", tancagem: 10, unidMedidaTancagem: "m3", qtdeBicos: 1 }],
      latitude: null,
      longitude: null,
      coordinateText: { latitude: "", longitude: "" },
      validationText: "",
      accuracyText: "",
      obtainedOn: "",
      informationOrigin: "",
      sigafStatus: "",
    } satisfies AnpApiRecord;
    const [station] = observeStations({
      apiRecords: [record],
      csvByCnpj: new Map(),
      route: [{ latitude: -32.56, longitude: -53.37 }],
      asOf: new Date("2026-11-17T00:00:00Z"),
    });
    expect(station.premium).toBe(true);
    expect(station.podiumText).toBe(false);
    expect(station.band).toBe("ungeolocated");
    expect(parseAnpApiPayload({ succeeded: true, data: [], searchPageFilter: { totalRegistro: 0, totalPagina: 1, numeroPagina: 1 } }).records).toEqual([]);
  });
});
