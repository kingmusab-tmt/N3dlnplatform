// GET /api/v1/me/claims — the signed-in user's places ("My places").
import { listUserClaims } from '@/lib/server/claims';
import { apiRoute, sessionUser, signInRequired } from '@/lib/server/http';

export const GET = apiRoute(async (req, { deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (!user) return signInRequired();
  const claims = await listUserClaims(deps.db, user.id);
  return Response.json({ claims }, { headers: { 'Cache-Control': 'private, no-store' } });
});
