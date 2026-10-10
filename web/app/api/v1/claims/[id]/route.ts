// GET /api/v1/claims/:id — the home profile behind a shareable link.
// The UUID is the capability: anyone holding the link can view it.
import { apiRoute, jsonError } from '@/lib/server/http';
import { getSharedPlace } from '@/lib/server/claims';

export const GET = apiRoute<{ id: string }>(async (_req, { params, deps }) => {
  const place = await getSharedPlace(deps.db, params.id);
  if (!place) return jsonError(404, 'CLAIM_NOT_FOUND', 'This link is invalid or has expired.');
  return Response.json(place, { headers: { 'Cache-Control': 'private, no-store' } });
});
