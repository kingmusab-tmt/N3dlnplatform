// DELETE /api/v1/me — delete the signed-in user's account and everything tied
// to it: their places (and share links) go; delivery runs they started stay,
// without the link to them. The website then signs them out.
import { apiRoute, jsonError, sessionUser, signInRequired } from '@/lib/server/http';

export const DELETE = apiRoute(async (req, { deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (!user) return signInRequired();

  const { rows: admin } = await deps.db.query(
    `SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = $1)
            AND (SELECT count(*) FROM admin_users) = 1 AS last_admin`,
    [user.id],
  );
  if (admin[0]?.last_admin === true) {
    return jsonError(409, 'LAST_ADMIN', 'You are the only admin. Add another admin before deleting your account.');
  }
  // Claims and admin rights cascade; runs keep their history with the creator cleared.
  await deps.db.query('DELETE FROM auth.users WHERE id = $1', [user.id]);
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
});
