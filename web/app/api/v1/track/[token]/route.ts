// GET /api/v1/track/:token — public delivery status for the customer's
// tracking page (/t/:token). The token in the link is the only access control.
import { apiRoute, jsonError, rateLimited } from '@/lib/server/http';
import { getTracking } from '@/lib/server/runs';

const POLLS_PER_MIN = 120;

export const GET = apiRoute<{ token: string }>(
  async (_req, { params, deps, caller }) => {
    const limit = await deps.limiter.hit(`track:${caller.kind === 'web' ? caller.ip : 'partner'}`, POLLS_PER_MIN, 60);
    if (!limit.allowed) return rateLimited(limit.retryAfterSec);
    const tracking = await getTracking(deps.db, params.token);
    if (!tracking) return jsonError(404, 'DELIVERY_NOT_FOUND', 'This tracking link is invalid or has expired.');
    return Response.json(tracking, { headers: { 'Cache-Control': 'no-store' } });
  },
  { auth: false },
);
