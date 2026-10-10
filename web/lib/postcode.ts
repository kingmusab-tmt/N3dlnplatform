import type { Feature, Point, Polygon } from 'geojson';

// Mirrors server/src/lib/postcode.js so the UI can validate before hitting the API.
const CANONICAL_PATTERN = /^([A-Z]{2})(0[1-9]|[1-9]\d)([A-Z0-9]{3})([A-Z]{2})(0[1-9]|[1-9]\d)$/;

export function normalizePostcode(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CANONICAL_PATTERN.test(cleaned) ? cleaned : null;
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
