// What a trip to a building is for. Deliveries use runs, tracking links and
// proof of delivery; emergency responders get straight-to-the-gate navigation
// by road, with nothing to fill in on arrival.

export const PURPOSE_IDS = ['delivery', 'ambulance', 'fire', 'police'] as const;
export type PurposeId = (typeof PURPOSE_IDS)[number];

export type Purpose = {
  id: PurposeId;
  /** Short name, e.g. on the selector. */
  label: string;
  /** Who is travelling, for headings ("Ambulance crew · live GPS"). */
  who: string;
  icon: string;
  emergency: boolean;
};

export const PURPOSES: Record<PurposeId, Purpose> = {
  delivery: { id: 'delivery', label: 'Delivery', who: 'Rider', icon: '📦', emergency: false },
  ambulance: { id: 'ambulance', label: 'Ambulance', who: 'Ambulance crew', icon: '🚑', emergency: true },
  fire: { id: 'fire', label: 'Fire service', who: 'Fire crew', icon: '🚒', emergency: true },
  police: { id: 'police', label: 'Police', who: 'Police', icon: '🚓', emergency: true },
};

export const EMERGENCY_PURPOSES = PURPOSE_IDS.filter((id) => PURPOSES[id].emergency).map((id) => PURPOSES[id]);

/** Nigeria's toll-free national emergency number. */
export const EMERGENCY_NUMBER = '112';

export function parsePurpose(value: unknown): PurposeId {
  return typeof value === 'string' && (PURPOSE_IDS as readonly string[]).includes(value) ? (value as PurposeId) : 'delivery';
}

/** Navigator link to a building, optionally to an owner's gate and for a purpose. */
export function navigatorHref(code: string, { claim, purpose }: { claim?: string | null; purpose?: PurposeId } = {}) {
  const params = new URLSearchParams({ code });
  if (claim) params.set('claim', claim);
  if (purpose && purpose !== 'delivery') params.set('for', purpose);
  return `/rider?${params}`;
}

/**
 * What a responder should know about the building on arrival, from mapped
 * data only: floors and height when OpenStreetMap records them (the 3D map's
 * own height is an estimate otherwise, so it is not shown as fact).
 */
export function buildingFacts(properties: Record<string, unknown> | undefined | null) {
  const p = properties ?? {};
  const facts: { label: string; value: string }[] = [];
  if (typeof p.street === 'string') {
    facts.push({ label: 'Street', value: typeof p.house_number === 'string' ? `${p.house_number} ${p.street}` : p.street });
  }
  if (typeof p.building_type === 'string' && p.building_type !== 'yes') {
    facts.push({ label: 'Type', value: p.building_type.replace(/_/g, ' ') });
  }
  if (typeof p.floors === 'number' && p.floors > 0) facts.push({ label: 'Floors', value: String(p.floors) });
  if (typeof p.height_m === 'number' && p.height_m > 0) facts.push({ label: 'Height', value: `${Math.round(p.height_m)} m` });
  return facts;
}
