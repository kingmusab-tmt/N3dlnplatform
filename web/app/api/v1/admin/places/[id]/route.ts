// DELETE /api/v1/admin/places/:id — remove a claimed place (moderation). Its share link stops working.
import { adminRoute } from '@/lib/server/admin';
import { jsonError } from '@/lib/server/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = adminRoute<{ id: string }>(async (_req, { params, deps }) => {
  if (!UUID.test(params.id)) return jsonError(400, 'INVALID_ID', 'Invalid place id.');
  const { rows } = await deps.db.query('DELETE FROM claims WHERE id = $1 RETURNING id', [params.id]);
  if (rows.length === 0) return jsonError(404, 'PLACE_NOT_FOUND', 'No place with that id.');
  return new Response(null, { status: 204 });
});
