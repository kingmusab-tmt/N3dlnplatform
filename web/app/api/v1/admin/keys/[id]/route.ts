// DELETE /api/v1/admin/keys/:id — revoke a partner API key (servers stop accepting it within a minute).
import { adminRoute } from '@/lib/server/admin';
import { jsonError } from '@/lib/server/http';

export const DELETE = adminRoute<{ id: string }>(async (_req, { params, deps }) => {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return jsonError(400, 'INVALID_ID', 'Invalid key id.');
  const { rows } = await deps.db.query(
    'UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING id',
    [id],
  );
  if (rows.length === 0) return jsonError(404, 'KEY_NOT_FOUND', 'No active key with that id.');
  return new Response(null, { status: 204 });
});
