import type { GeoPoint } from "@/lib/route-overlay/types";

/**
 * Google's encoded polyline format.
 * https://developers.google.com/maps/documentation/utilities/polylinealgorithm
 */

function encodeSigned(value: number): string {
  let signed = value << 1;
  if (value < 0) {
    signed = ~signed;
  }
  let output = "";
  while (signed >= 0x20) {
    output += String.fromCharCode((0x20 | (signed & 0x1f)) + 63);
    signed >>= 5;
  }
  output += String.fromCharCode(signed + 63);
  return output;
}

export function encodePolyline(points: GeoPoint[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let output = "";
  for (const point of points) {
    const lat = Math.round(point.latitude * 1e5);
    const lng = Math.round(point.longitude * 1e5);
    output += encodeSigned(lat - lastLat);
    output += encodeSigned(lng - lastLng);
    lastLat = lat;
    lastLng = lng;
  }
  return output;
}

export function decodePolyline(encoded: string): GeoPoint[] {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const points: GeoPoint[] = [];

  while (index < encoded.length) {
    const latitudeDelta = decodeChunk(encoded, index);
    index = latitudeDelta.index;
    latitude += latitudeDelta.value;

    const longitudeDelta = decodeChunk(encoded, index);
    index = longitudeDelta.index;
    longitude += longitudeDelta.value;

    points.push({
      latitude: latitude / 1e5,
      longitude: longitude / 1e5,
    });
  }

  return points;
}

function decodeChunk(
  encoded: string,
  start: number,
): { value: number; index: number } {
  let result = 0;
  let shift = 0;
  let index = start;
  let byte = 0;
  do {
    if (index >= encoded.length) {
      break;
    }
    byte = encoded.charCodeAt(index) - 63;
    index += 1;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const value = result & 1 ? ~(result >> 1) : result >> 1;
  return { value, index };
}
