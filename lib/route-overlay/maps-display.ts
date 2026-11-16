/**
 * Boundary for drawing Routes API polylines on a Google map.
 * Both values stay off unless the operator sets them. Loading the script is billable.
 * https://developers.google.com/maps/documentation/javascript/overview
 */

export interface MapsDisplayConfig {
  enabled: boolean;
  configured: boolean;
  available: boolean;
  apiKey: string;
}

export function readMapsDisplayConfig(
  env: NodeJS.ProcessEnv = process.env,
): MapsDisplayConfig {
  const enabled = env.ROUTE_OVERLAY_GOOGLE_MAPS_JS_ENABLED === "true";
  const apiKey = (env.GOOGLE_MAPS_JS_API_KEY ?? "").trim();
  return {
    enabled,
    configured: apiKey.length > 0,
    available: enabled && apiKey.length > 0,
    apiKey,
  };
}
