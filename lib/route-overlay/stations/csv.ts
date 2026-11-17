import { normalizeCnpj } from "@/lib/route-overlay/stations/cnpj";
import type { AnpCsvRecord } from "@/lib/route-overlay/stations/types";

export const ANP_CSV_COLUMNS = [
  "CODIGOISIMP",
  "AUTORIZACAO",
  "DATAPUBLICACAO",
  "RAZAOSOCIAL",
  "CNPJ",
  "ENDERECO",
  "COMPLEMENTO",
  "BAIRRO",
  "CEP",
  "UF",
  "MUNICIPIO",
  "BANDEIRA",
  "DATAVINCULACAO",
] as const;

export class AnpCsvSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnpCsvSchemaError";
  }
}

export interface AnpCsvParseResult {
  encoding: "utf-8" | "latin1";
  records: AnpCsvRecord[];
  extraColumns: string[];
  warnings: string[];
}

export function parseAnpCsv(bytes: Uint8Array): AnpCsvParseResult {
  const decoded = decodeCsv(bytes);
  const rows = splitRows(decoded.text);
  if (rows.length === 0) {
    throw new AnpCsvSchemaError("ANP CSV is empty.");
  }
  const header = splitCsvLine(rows[0]).map((cell) => cell.trim().toUpperCase());
  const missing = ANP_CSV_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new AnpCsvSchemaError(`ANP CSV is missing columns: ${missing.join(", ")}.`);
  }
  const extraColumns = header.filter(
    (column) => !ANP_CSV_COLUMNS.includes(column as (typeof ANP_CSV_COLUMNS)[number]),
  );
  const index = new Map(header.map((column, position) => [column, position]));
  const records: AnpCsvRecord[] = [];
  const warnings: string[] = [];
  if (extraColumns.length > 0) {
    warnings.push(`Unexpected columns were ignored: ${extraColumns.join(", ")}.`);
  }
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const cells = splitCsvLine(rows[rowIndex]);
    if (cells.every((cell) => cell.trim() === "")) {
      continue;
    }
    if (cells.length < header.length) {
      warnings.push(`Row ${rowIndex + 1} has ${cells.length} columns; expected ${header.length}.`);
    }
    records.push({
      codigoIsimp: cell(cells, index, "CODIGOISIMP"),
      autorizacao: cell(cells, index, "AUTORIZACAO"),
      dataPublicacao: cell(cells, index, "DATAPUBLICACAO"),
      razaoSocial: cell(cells, index, "RAZAOSOCIAL"),
      cnpj: normalizeCnpj(cell(cells, index, "CNPJ")),
      endereco: cell(cells, index, "ENDERECO"),
      complemento: cell(cells, index, "COMPLEMENTO"),
      bairro: cell(cells, index, "BAIRRO"),
      cep: cell(cells, index, "CEP"),
      uf: cell(cells, index, "UF").toUpperCase(),
      municipio: cell(cells, index, "MUNICIPIO"),
      bandeira: cell(cells, index, "BANDEIRA"),
      dataVinculacao: cell(cells, index, "DATAVINCULACAO"),
    });
  }
  return { encoding: decoded.encoding, records, extraColumns, warnings };
}

function decodeCsv(bytes: Uint8Array): { text: string; encoding: "utf-8" | "latin1" } {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (!utf8.includes("\uFFFD")) {
    return { text: utf8.replace(/^\uFEFF/, ""), encoding: "utf-8" };
  }
  const latin1 = new TextDecoder("latin1").decode(bytes);
  return { text: latin1.replace(/^\uFEFF/, ""), encoding: "latin1" };
}

function splitRows(text: string): string[] {
  return text.split(/\r?\n/).filter((row, index, rows) => row.length > 0 || index < rows.length - 1);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === ";" && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  cells.push(current);
  return cells;
}

function cell(cells: string[], index: Map<string, number>, column: string): string {
  const position = index.get(column);
  if (position === undefined) {
    return "";
  }
  return (cells[position] ?? "").trim();
}
