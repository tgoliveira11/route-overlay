import {
  googleApiStatus,
  readGoogleApiConfig,
} from "@/lib/route-overlay/google-routes";
import { readMapsDisplayConfig } from "@/lib/route-overlay/maps-display";

export const dynamic = "force-dynamic";

export function GET() {
  const status = googleApiStatus(readGoogleApiConfig());
  const maps = readMapsDisplayConfig();
  return Response.json({
    ...status,
    mapsDisplayAvailable: maps.available,
    mapsJsKey: maps.available ? maps.apiKey : null,
  });
}
