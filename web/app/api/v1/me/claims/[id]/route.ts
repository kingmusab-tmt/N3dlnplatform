// PATCH  /api/v1/me/claims/:id { label?, delivery_notes?, gate?: { lng, lat } | null }
// DELETE /api/v1/me/claims/:id — also kills its share link.
// Only the claim's owner can do either; anyone else gets 404, as if it didn't exist.
import { GATE_MAX_DISTANCE_M, parseClaimFields } from '@/lib/server/claimInput';
import { deleteUserClaim, ownedGateDistance, updateUserClaim } from '@/lib/server/claims';
import { apiRoute, jsonError, sessionUser, signInRequired } from '@/lib/server/http';

const notFound = () => jsonError(404, 'CLAIM_NOT_FOUND', 'No such place in your account.');

export const PATCH = apiRoute<{ id: string }>(async (req, { params, deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (!user) return signInRequired();

  const { fields, problems } = parseClaimFields(await req.json().catch(() => null), { partial: true });
  if (problems.length) return jsonError(400, 'INVALID_CLAIM', problems.join('; '));

  if (fields.gate) {
    const distance = await ownedGateDistance(deps.db, params.id, user.id, fields.gate);
    if (distance === null) return notFound();
    if (distance > GATE_MAX_DISTANCE_M) {
      return jsonError(
        400,
        'GATE_TOO_FAR',
        `The gate must be within ${GATE_MAX_DISTANCE_M} m of the building (it is ${Math.round(distance)} m away).`,
      );
    }
  }

  const claim = await updateUserClaim(deps.db, params.id, user.id, fields);
  return claim ? Response.json(claim) : notFound();
});

export const DELETE = apiRoute<{ id: string }>(async (req, { params, deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (!user) return signInRequired();
  return (await deleteUserClaim(deps.db, params.id, user.id)) ? new Response(null, { status: 204 }) : notFound();
});
