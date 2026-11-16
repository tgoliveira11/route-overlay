import { lookup } from "node:dns/promises";

/**
 * Public suffixes used by Google Maps websites.
 * A hostname is allowed only when the full name is in the generated set.
 * Comparison does not use prefix matching, so google.evil.com is rejected.
 */
const GOOGLE_MAPS_SUFFIXES = [
  "com",
  "ad",
  "ae",
  "com.af",
  "com.ag",
  "al",
  "am",
  "co.ao",
  "com.ar",
  "as",
  "at",
  "com.au",
  "az",
  "ba",
  "com.bd",
  "be",
  "bf",
  "bg",
  "com.bh",
  "bi",
  "bj",
  "com.bn",
  "com.bo",
  "com.br",
  "bs",
  "bt",
  "co.bw",
  "by",
  "com.bz",
  "ca",
  "cd",
  "cf",
  "cg",
  "ch",
  "ci",
  "co.ck",
  "cl",
  "cm",
  "cn",
  "com.co",
  "co.cr",
  "com.cu",
  "cv",
  "com.cy",
  "cz",
  "de",
  "dj",
  "dk",
  "dm",
  "com.do",
  "dz",
  "com.ec",
  "ee",
  "com.eg",
  "es",
  "com.et",
  "fi",
  "com.fj",
  "fm",
  "fr",
  "ga",
  "ge",
  "gg",
  "com.gh",
  "com.gi",
  "gl",
  "gm",
  "gr",
  "com.gt",
  "gy",
  "com.hk",
  "hn",
  "hr",
  "ht",
  "hu",
  "co.id",
  "ie",
  "co.il",
  "im",
  "co.in",
  "iq",
  "is",
  "it",
  "je",
  "com.jm",
  "jo",
  "co.jp",
  "co.ke",
  "com.kh",
  "ki",
  "kg",
  "co.kr",
  "com.kw",
  "kz",
  "la",
  "com.lb",
  "li",
  "lk",
  "co.ls",
  "lt",
  "lu",
  "lv",
  "com.ly",
  "co.ma",
  "md",
  "me",
  "mg",
  "mk",
  "ml",
  "com.mm",
  "mn",
  "ms",
  "com.mt",
  "mu",
  "mv",
  "mw",
  "com.mx",
  "com.my",
  "co.mz",
  "com.na",
  "com.ng",
  "com.ni",
  "ne",
  "nl",
  "no",
  "com.np",
  "nr",
  "nu",
  "co.nz",
  "com.om",
  "com.pa",
  "com.pe",
  "com.pg",
  "com.ph",
  "com.pk",
  "pl",
  "pn",
  "com.pr",
  "ps",
  "pt",
  "com.py",
  "com.qa",
  "ro",
  "ru",
  "rw",
  "com.sa",
  "com.sb",
  "sc",
  "se",
  "com.sg",
  "sh",
  "si",
  "sk",
  "com.sl",
  "sn",
  "so",
  "sm",
  "sr",
  "st",
  "com.sv",
  "td",
  "tg",
  "co.th",
  "com.tj",
  "tl",
  "tm",
  "tn",
  "to",
  "com.tr",
  "tt",
  "com.tw",
  "co.tz",
  "com.ua",
  "co.ug",
  "co.uk",
  "com.uy",
  "co.uz",
  "com.vc",
  "co.ve",
  "vg",
  "co.vi",
  "com.vn",
  "vu",
  "ws",
  "rs",
  "co.za",
  "co.zm",
  "co.zw",
  "cat",
] as const;

const GOOGLE_MAPS_HOSTS = new Set<string>();
for (const suffix of GOOGLE_MAPS_SUFFIXES) {
  GOOGLE_MAPS_HOSTS.add(`google.${suffix}`);
  GOOGLE_MAPS_HOSTS.add(`maps.google.${suffix}`);
}
GOOGLE_MAPS_HOSTS.add("maps.app.goo.gl");
GOOGLE_MAPS_HOSTS.add("goo.gl");

/** Redirects followed after the initial short-link request. The next target is not fetched. */
export const MAX_SHORT_LINK_REDIRECTS = 5;

export type HostResolver = (hostname: string) => Promise<string[]>;

export function canonicalMapsHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith(".")) {
    host = host.slice(0, -1);
  }
  if (host.startsWith("www.")) {
    host = host.slice("www.".length);
  }
  return host;
}

export function isAllowlistedMapsHost(hostname: string): boolean {
  return GOOGLE_MAPS_HOSTS.has(canonicalMapsHostname(hostname));
}

export function isShortLinkUrl(url: URL): boolean {
  const host = canonicalMapsHostname(url.hostname);
  if (host === "maps.app.goo.gl") {
    return true;
  }
  return host === "goo.gl" && url.pathname.startsWith("/maps");
}

export function isFullMapsUrl(url: URL): boolean {
  const host = canonicalMapsHostname(url.hostname);
  if (!GOOGLE_MAPS_HOSTS.has(host) || host === "maps.app.goo.gl" || host === "goo.gl") {
    return false;
  }
  return url.pathname === "/maps" || url.pathname.startsWith("/maps/");
}

export async function defaultResolveHost(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export function isIpLiteral(hostname: string): boolean {
  const bare = stripIpBrackets(hostname);
  if (bare.includes(":")) {
    return parseIpv6(bare) !== null;
  }
  return parseIpv4(bare) !== null;
}

/**
 * True for loopback, private, link-local, documentation, and other non-global addresses.
 * Unparseable values are treated as unsafe.
 */
export function isNonPublicAddress(address: string): boolean {
  const bare = stripIpBrackets(address.trim());
  if (bare.includes(":")) {
    const groups = parseIpv6(bare);
    if (!groups) {
      return true;
    }
    return !isPublicIpv6(groups);
  }
  const ipv4 = parseIpv4(bare);
  if (ipv4 === null) {
    return true;
  }
  return !isPublicIpv4(ipv4);
}

function stripIpBrackets(value: string): string {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1);
  }
  return value;
}

function parseIpv4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function parseIpv6(address: string): number[] | null {
  let value = address.toLowerCase();
  const zone = value.indexOf("%");
  if (zone !== -1) {
    value = value.slice(0, zone);
  }
  const lastColon = value.lastIndexOf(":");
  if (value.includes(".")) {
    if (lastColon === -1) {
      return null;
    }
    const ipv4 = parseIpv4(value.slice(lastColon + 1));
    if (ipv4 === null) {
      return null;
    }
    const high = ((ipv4 >>> 16) & 0xffff).toString(16);
    const low = (ipv4 & 0xffff).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && head.length !== 8) {
    return null;
  }
  if (head.length + tail.length > 8) {
    return null;
  }
  const missing = 8 - head.length - tail.length;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill("0"), ...tail];
  if (groups.length !== 8) {
    return null;
  }
  const parsed: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    parsed.push(Number.parseInt(group, 16));
  }
  return parsed;
}

function isPublicIpv4(ip: number): boolean {
  const blocked: Array<[number, number]> = [
    [0x00000000, 8],
    [0x0a000000, 8],
    [0x64400000, 10],
    [0x7f000000, 8],
    [0xa9fe0000, 16],
    [0xac100000, 12],
    [0xc0000000, 24],
    [0xc0000200, 24],
    [0xc0a80000, 16],
    [0xc6120000, 15],
    [0xc6336400, 24],
    [0xcb007100, 24],
    [0xe0000000, 4],
    [0xf0000000, 4],
  ];
  return !blocked.some(([base, bits]) => inCidr(ip, base, bits));
}

function inCidr(ip: number, base: number, bits: number): boolean {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ip & mask) === (base & mask);
}

function isPublicIpv6(groups: number[]): boolean {
  if (isIpv4Mapped(groups)) {
    return isPublicIpv4(hextetsToIpv4(groups[6], groups[7]));
  }
  if (is6to4(groups)) {
    return isPublicIpv4(hextetsToIpv4(groups[1], groups[2]));
  }
  if (isNat64(groups)) {
    return isPublicIpv4(hextetsToIpv4(groups[6], groups[7]));
  }
  if (!isGlobalUnicast(groups)) {
    return false;
  }
  if (isDocumentation(groups) || isTeredo(groups) || isBenchmark(groups) || isDiscard(groups)) {
    return false;
  }
  return true;
}

function isIpv4Mapped(groups: number[]): boolean {
  return (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  );
}

function is6to4(groups: number[]): boolean {
  return groups[0] === 0x2002;
}

function isNat64(groups: number[]): boolean {
  return groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0 && groups[3] === 0 && groups[4] === 0 && groups[5] === 0;
}

function isGlobalUnicast(groups: number[]): boolean {
  return groups[0] >= 0x2000 && groups[0] <= 0x3fff;
}

function isDocumentation(groups: number[]): boolean {
  return groups[0] === 0x2001 && groups[1] === 0x0db8;
}

function isTeredo(groups: number[]): boolean {
  return groups[0] === 0x2001 && groups[1] === 0;
}

function hextetsToIpv4(high: number, low: number): number {
  return (high * 65536 + low) >>> 0;
}

function isBenchmark(groups: number[]): boolean {
  return groups[0] === 0x2001 && groups[1] === 0x0002 && groups[2] === 0;
}

function isDiscard(groups: number[]): boolean {
  return (
    groups[0] === 0x0100 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0
  );
}
