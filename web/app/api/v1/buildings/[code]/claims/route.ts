// POST /api/v1/buildings/:code/claims { label, delivery_notes? }
import { formatPostcode, normalizePostcode } from '@/lib/postcode';
import { apiRoute, callerBucket, jsonError, rateLimited } from '@/lib/server/http';

const LABEL_MAX = 80;
const NOTES_MAX = 500;
const CLAIMS_PER_HOUR = 20;

const INSERT_CLAIM_SQL = `
  INSERT INTO claims (building_id, label, delivery_notes)
  SELECT id, $2, $3 FROM buildings WHERE nipost_code = $1
  RETURNING id, label, delivery_notes, status, created_at
`;

export const POST = apiRoute<{ code: string }>(async (req, { params, deps, caller }) => {
  // Claims are public writes: cap them per caller on top of the general limit.
  const limit = await deps.limiter.hit(`claims:${callerBucket(caller)}`, CLAIMS_PER_HOUR, 3600);
  if (!limit.allowed) return rateLimited(limit.retryAfterSec);

  const code = normalizePostcode(params.code);
  if (!code) return jsonError(400, 'INVALID_POSTCODE', 'Expected an 11-character NIPOST code.');

  const body = await req.json().catch(() => null);
  const label = cleanText(body?.label);
  const notes = cleanText(body?.delivery_notes);
  const problems = [];
  if (!label) problems.push('label is required');
  if (label.length > LABEL_MAX) problems.push(`label must be at most ${LABEL_MAX} characters`);
  if (notes.length > NOTES_MAX) problems.push(`delivery_notes must be at most ${NOTES_MAX} characters`);
  if (problems.length) return jsonError(400, 'INVALID_CLAIM', problems.join('; '));

  const { rows } = await deps.db.query(INSERT_CLAIM_SQL, [code, label, notes || null]);
  if (rows.length === 0) {
    return jsonError(404, 'POSTCODE_NOT_FOUND', `No building is registered for ${formatPostcode(code)}.`);
  }
  const claim = rows[0];
  return Response.json(
    {
      id: claim.id,
      code,
      formatted: formatPostcode(code),
      label: claim.label,
      delivery_notes: claim.delivery_notes,
      status: claim.status,
      created_at: claim.created_at,
    },
    { status: 201 },
  );
});

/** Trims and strips control characters (keeping newlines in notes). */
function cleanText(value: unknown) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}
