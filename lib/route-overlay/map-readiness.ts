/**
 * A live candidate can be confirmed only after the selected polyline was the
 * one actually drawn. Confirmation still does not prove the shared Google
 * Maps alternative was recovered.
 */
export function selectedPolylineRendered(input: {
  selectedPolyline: string | null;
  renderedPolyline: string | null;
  mapReportedReady: boolean;
}): boolean {
  return Boolean(
    input.mapReportedReady &&
      input.selectedPolyline &&
      input.renderedPolyline &&
      input.selectedPolyline === input.renderedPolyline,
  );
}
