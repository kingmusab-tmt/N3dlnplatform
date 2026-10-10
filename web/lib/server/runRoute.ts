// Route wrapper for the rider's own endpoints: authenticated by the run's
// secret rider token (X-Rider-Token), not an API key, and rate-limited per
// run so a fleet's riders don't share one partner's limit.
import type { Deps } from './deps';
import { apiRoute, jsonError, rateLimited } from './http';
import { RunError, authorizeRun } from './runs';

const RIDER_LIMIT_PER_MIN = 60;

type RunCtx<P> = { params: P; deps: Deps; run: { id: string; status: string; profile: string } };

export function runRoute<P extends { id: string }>(handler: (req: Request, ctx: RunCtx<P>) => Promise<Response>) {
  return apiRoute<P>(
    async (req, { params, deps }) => {
      const run = await authorizeRun(deps.db, params.id, req.headers.get('x-rider-token'));
      if (!run) return jsonError(401, 'INVALID_RIDER_TOKEN', 'Send the run’s rider token in the X-Rider-Token header.');
      const limit = await deps.limiter.hit(`run:${run.id}`, RIDER_LIMIT_PER_MIN, 60);
      if (!limit.allowed) return rateLimited(limit.retryAfterSec);
      try {
        return await handler(req, { params, deps, run });
      } catch (err) {
        if (err instanceof RunError) return jsonError(err.status, err.code, err.message);
        throw err;
      }
    },
    { auth: false },
  );
}
