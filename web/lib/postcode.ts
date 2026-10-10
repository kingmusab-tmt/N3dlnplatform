import type { Feature, Point, Polygon } from 'geojson';

// NIPOST digital postcode (https://docs.postcode.gov.ng/concepts/postcode-format):
//   State (2 alpha) | LGA (2 digits, 01-99) | District (3 alphanumeric)
//   | Area (2 alpha) | Building unit (2 digits, 01-99)
// e.g. "EK 01 A03 FK 01" == "EK-01-A03-FK-01" == "ek01a03fk01" -> canonical "EK01A03FK01".
// Shared by the browser (pre-validation) and the API.
const CANONICAL_PATTERN = /^([A-Z]{2})(0[1-9]|[1-9]\d)([A-Z0-9]{3})([A-Z]{2})(0[1-9]|[1-9]\d)$/;

/** Strips separators and uppercases; returns the canonical 11-char code, or null if invalid. */
export function normalizePostcode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CANONICAL_PATTERN.test(cleaned) ? cleaned : null;
}

/** "FC02A09DB09" -> "FC 02 A09 DB 09" for display. */
export function formatPostcode(code: string) {
  const m = CANONICAL_PATTERN.exec(code);
  return m ? m.slice(1).join(' ') : code;
}

/** "FC02A09DB09" -> "FC-02-A09-DB-09", the form NIPOST's API documents. */
export function hyphenatePostcode(code: string) {
  const m = CANONICAL_PATTERN.exec(code);
  return m ? m.slice(1).join('-') : code;
}

export type Segments = { state: string; lga: string; district: string; area: string; building: string };

/** "FC02A09DB09" -> { state: "FC", lga: "02", district: "A09", area: "DB", building: "09" } */
export function parsePostcode(code: string): Segments | null {
  const m = CANONICAL_PATTERN.exec(code);
  if (!m) return null;
  const [, state, lga, district, area, building] = m;
  return { state, lga, district, area, building };
}

export type Verification = {
  source: 'nipost';
  status: 'verified' | 'unregistered' | 'not_in_sandbox' | 'unavailable' | 'not_configured';
  environment?: 'test' | 'live';
  level?: number;
  reason?: string;
};

export type NavigateResponse = {
  code: string;
  formatted: string;
  segments: { state: string; lga: string; district: string; area: string; building: string };
  source: 'platform' | 'nipost';
  /** Present on code searches; absent when the building was picked on the map. */
  verification?: Verification;
  /** Present when the building was picked on the map. */
  pin?: { lng: number; lat: number; distance_m: number };
  center: [number, number];
  bbox: [number, number, number, number] | null;
  /** null when NIPOST supplied a point but no footprint is mapped there yet. */
  building: Feature<Polygon, { nipost_code: string; height_m?: number; [k: string]: unknown }> | null;
  centerPoint?: Feature<Point>;
  nipostPoint?: [number, number];
};

export type Claim = {
  id: string;
  code: string;
  formatted: string;
  label: string;
  delivery_notes: string | null;
  status: 'unverified' | 'verified' | 'rejected';
  created_at: string;
};

/** A claimed building as served behind a shareable /h/<id> link. */
export type SharedPlace = NavigateResponse & {
  claim: Omit<Claim, 'code' | 'formatted'>;
};

/** Where a rider should head: the mapped gate if known, else the building center. */
export function destinationOf(place: NavigateResponse): [number, number] {
  const gate = place.building?.properties.gate as { lng?: number; lat?: number } | undefined;
  return typeof gate?.lng === 'number' && typeof gate?.lat === 'number' ? [gate.lng, gate.lat] : place.center;
}

export function googleMapsDirectionsUrl([lng, lat]: [number, number]) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export type RouteProfile = 'driving' | 'cycling' | 'walking';

/** GET /api/v1/navigate/:code/route */
export type RouteResponse = NavigateResponse & {
  profile: RouteProfile;
  origin: [number, number];
  destination: { point: [number, number]; kind: 'gate' | 'center' };
  route: {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    distance_m: number;
    duration_s: number;
    steps: { instruction: string; distance_m: number; road: string; maneuver: string; location: [number, number] }[];
  };
  lastMile: { geometry: { type: 'LineString'; coordinates: [number, number][] }; distance_m: number } | null;
};
