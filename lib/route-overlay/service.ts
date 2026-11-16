import {
  googleApiStatus,
  computeGoogleRoutes,
  readGoogleApiConfig,
  type GoogleApiConfig,
} from "@/lib/route-overlay/google-routes";
import { reconstructMock } from "@/lib/route-overlay/mock-reconstruct";
import {
  expandShortLink,
  parseMapsUrl,
} from "@/lib/route-overlay/parse-maps-url";
import { assessRecoverability } from "@/lib/route-overlay/recoverability";
import type {
  ImportOutcome,
  ReconstructOutcome,
} from "@/lib/route-overlay/types";

export interface ServiceOptions {
  expandShortLinks?: boolean;
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<string[]>;
  config?: GoogleApiConfig;
}

export async function importMapsUrl(
  input: string,
  options: ServiceOptions = {},
): Promise<ImportOutcome> {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "Paste a Google Maps directions URL." };
  }

  let parsed = parseMapsUrl(trimmed);
  if (parsed.kind === "short_link" && options.expandShortLinks !== false) {
    const expanded = await expandShortLink(trimmed, options.fetchImpl, 4000, {
      resolveHost: options.resolveHost,
    });
    if (!expanded.ok) {
      parsed.warnings.push(expanded.error);
    } else {
      const inner = parseMapsUrl(expanded.url);
      inner.inputUrl = trimmed;
      inner.shortLink = true;
      inner.expandedFrom = trimmed;
      parsed = inner;
    }
  }

  if (parsed.kind === "invalid") {
    return {
      ok: false,
      status: 400,
      error: parsed.warnings[0] ?? "The URL could not be parsed.",
    };
  }

  return {
    ok: true,
    result: {
      parsed,
      recoverability: assessRecoverability(parsed),
    },
  };
}

export async function reconstructFromUrl(
  input: string,
  mode: unknown,
  options: ServiceOptions = {},
): Promise<ReconstructOutcome> {
  if (mode !== "mock" && mode !== "live") {
    return { ok: false, status: 400, error: "Field mode must be \"mock\" or \"live\"." };
  }

  const imported = await importMapsUrl(input, options);
  if (!imported.ok) {
    return imported;
  }

  const { parsed, recoverability } = imported.result;
  if (!recoverability.canReconstructStops) {
    return {
      ok: false,
      status: 422,
      error: recoverability.summary,
    };
  }

  const config = options.config ?? readGoogleApiConfig();
  const status = googleApiStatus(config);

  if (mode === "mock") {
    return {
      ok: true,
      status: 200,
      parsed,
      recoverability,
      reconstruction: reconstructMock(parsed, status),
    };
  }

  if (!status.liveAvailable) {
    return {
      ok: false,
      status: 409,
      error: status.reason,
      googleApi: status,
    };
  }

  const reconstruction = await computeGoogleRoutes(parsed, {
    config,
    fetchImpl: options.fetchImpl,
  });
  if (reconstruction.googleApi.error && reconstruction.routes.length === 0) {
    return {
      ok: false,
      status: 502,
      error: reconstruction.googleApi.error,
      googleApi: status,
    };
  }

  return {
    ok: true,
    status: 200,
    parsed,
    recoverability,
    reconstruction,
  };
}
