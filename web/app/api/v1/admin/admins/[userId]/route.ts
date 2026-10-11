// DELETE /api/v1/admin/admins/:userId — remove admin access. The last admin can't be removed.
import { adminRoute } from '@/lib/server/admin';
import { jsonError } from '@/lib/server/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DELETE = adminRoute<{ userId: string }>(async (_req, { params, deps }) => {
  if (!UUID.test(params.userId)) return jsonError(400, 'INVALID_ID', 'Invalid user id.');
  const { rows } = await deps.db.query(
    `DELETE FROM admin_users WHERE user_id = $1 AND (SELECT count(*) FROM admin_users) > 1 RETURNING user_id`,
    [params.userId],
  );
  if (rows.length === 0) return jsonError(409, 'CANNOT_REMOVE', 'Not removed: unknown admin, or the last admin.');
  return new Response(null, { status: 204 });
});
