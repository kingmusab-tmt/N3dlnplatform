// Small spherical-geometry helpers for the rider simulation (no turf needed).
export type LngLat = [number, number];

const R = 6_371_000;
const rad = Math.PI / 180;

export function distanceMetres([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Compass bearing in degrees (0 = north) from a to b. */
export function bearing([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const y = Math.sin((lng2 - lng1) * rad) * Math.cos(lat2 * rad);
  const x =
    Math.cos(lat1 * rad) * Math.sin(lat2 * rad) -
    Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lng2 - lng1) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** A polyline with precomputed cumulative distances for fast interpolation. */
export function measureLine(coords: LngLat[]) {
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + distanceMetres(coords[i - 1], coords[i]));
  return { coords, cumulative, length: cumulative.at(-1) ?? 0 };
}

/** Point and heading at `d` metres along a measured line (clamped to its ends). */
export function pointAlong(line: ReturnType<typeof measureLine>, d: number): { point: LngLat; heading: number } {
  const { coords, cumulative, length } = line;
  if (coords.length < 2) return { point: coords[0], heading: 0 };
  const target = Math.max(0, Math.min(d, length));

  let i = 1;
  while (i < cumulative.length - 1 && cumulative[i] < target) i++;
  const a = coords[i - 1];
  const b = coords[i];
  const seg = cumulative[i] - cumulative[i - 1];
  const t = seg > 0 ? (target - cumulative[i - 1]) / seg : 0;
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) };
}

/** Bounding box [[minLng, minLat], [maxLng, maxLat]] of some points. */
export function boundsOf(points: LngLat[]): [LngLat, LngLat] {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of points) {
    minLng = Math.min(minLng, lng);
    minLat = Math.min(minLat, lat);
    maxLng = Math.max(maxLng, lng);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLng, minLat], [maxLng, maxLat]];
}
