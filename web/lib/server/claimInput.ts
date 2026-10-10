// Validation for claim fields, shared by creating and editing a claim.
import { isLngLat } from './http';

export const LABEL_MAX = 80;
export const NOTES_MAX = 500;
/** A gate further than this from the footprint is almost certainly a mis-tap. */
export const GATE_MAX_DISTANCE_M = 30;

export type ClaimFields = {
  label?: string;
  delivery_notes?: string | null;
  /** undefined = leave as is, null = remove. */
  gate?: [number, number] | null;
};

/**
 * Parses claim fields from a JSON body. With `partial`, missing fields are
 * left out (for edits); otherwise `label` is required (for creation).
 */
export function parseClaimFields(body: any, { partial = false } = {}): { fields: ClaimFields; problems: string[] } {
  const fields: ClaimFields = {};
  const problems: string[] = [];

  if (!partial || body?.label !== undefined) {
    const label = cleanText(body?.label);
    if (!label) problems.push('label is required');
    else if (label.length > LABEL_MAX) problems.push(`label must be at most ${LABEL_MAX} characters`);
    fields.label = label;
  }
  if (!partial || body?.delivery_notes !== undefined) {
    const notes = cleanText(body?.delivery_notes);
    if (notes.length > NOTES_MAX) problems.push(`delivery_notes must be at most ${NOTES_MAX} characters`);
    fields.delivery_notes = notes || null;
  }
  if (body?.gate === null) {
    fields.gate = null;
  } else if (body?.gate !== undefined) {
    const gate: [number, number] = [Number(body.gate?.lng), Number(body.gate?.lat)];
    if (!isLngLat(gate[0], gate[1])) problems.push('gate must be { lng, lat } in WGS84');
    fields.gate = gate;
  }
  return { fields, problems };
}

/** Trims and strips control characters (keeping newlines in notes). */
function cleanText(value: unknown) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}
