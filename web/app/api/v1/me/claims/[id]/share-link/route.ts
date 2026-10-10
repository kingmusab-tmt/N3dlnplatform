// POST /api/v1/me/claims/:id/share-link — revoke the current share link and
// issue a new one. Anyone holding the old /h/<share_id> link loses access.
import { rotateShareLink } from '@/lib/server/claims';
import { apiRoute, jsonError, sessionUser, signInRequired } from '@/lib/server/http';

export const POST = apiRoute<{ id: string }>(async (req, { params, deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (!user) return signInRequired();
  const claim = await rotateShareLink(deps.db, params.id, user.id);
  return claim ? Response.json(claim) : jsonError(404, 'CLAIM_NOT_FOUND', 'No such place in your account.');
});
