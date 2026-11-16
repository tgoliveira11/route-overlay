import { describe, expect, it } from "vitest";
import { decodePolyline, encodePolyline } from "@/lib/route-overlay/polyline";

describe("encoded polylines", () => {
  it("decodes the Google reference polyline", () => {
    const points = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(points).toHaveLength(3);
    expect(points[0].latitude).toBeCloseTo(38.5, 5);
    expect(points[0].longitude).toBeCloseTo(-120.2, 5);
    expect(points[1].latitude).toBeCloseTo(40.7, 5);
    expect(points[1].longitude).toBeCloseTo(-120.95, 5);
    expect(points[2].latitude).toBeCloseTo(43.252, 5);
    expect(points[2].longitude).toBeCloseTo(-126.453, 5);
  });

  it("round-trips São Paulo coordinates within the format precision", () => {
    const original = [
      { latitude: -23.6261, longitude: -46.6563 },
      { latitude: -23.5415, longitude: -46.6296 },
      { latitude: -23.5614, longitude: -46.6558 },
    ];
    const decoded = decodePolyline(encodePolyline(original));
    expect(decoded).toHaveLength(original.length);
    decoded.forEach((point, index) => {
      expect(point.latitude).toBeCloseTo(original[index].latitude, 5);
      expect(point.longitude).toBeCloseTo(original[index].longitude, 5);
    });
  });
});
