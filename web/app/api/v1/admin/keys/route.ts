// POST /api/v1/admin/keys — create a partner API key. The key is returned once.
import { adminRoute } from '@/lib/server/admin';
import { generateKey } from '@/lib/server/apiKeys';
import { jsonError } from '@/lib/server/http';

export const POST = adminRoute(async (req, { deps }) => {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const limit = Number(body?.rate_limit_per_min ?? 120);
  if (name.length < 2 || name.length > 80) return jsonError(400, 'INVALID_NAME', 'Give the partner a name (2–80 characters).');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
    return jsonError(400, 'INVALID_LIMIT', 'The rate limit must be a whole number of requests per minute, 1–10,000.');
  }
  const { key, hash, displayPrefix } = generateKey();
  const { rows } = await deps.db.query(
    `INSERT INTO api_keys (name, kind, key_prefix, key_hash, rate_limit_per_min)
     VALUES ($1, 'partner', $2, $3, $4) RETURNING id`,
    [name, displayPrefix, hash, limit],
  );
  return Response.json({ id: Number(rows[0].id), name, key, key_prefix: displayPrefix, rate_limit_per_min: limit }, { status: 201 });
});
