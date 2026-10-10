// POST /api/v1/runs — start a delivery run: ordered stops, each with a
// customer tracking link and optional proof-of-delivery code.
import { apiRoute, jsonError, sessionUser } from '@/lib/server/http';
import { RunError, createRun, parseRunInput } from '@/lib/server/runs';

export const POST = apiRoute(async (req, { deps, caller }) => {
  try {
    const input = parseRunInput(await req.json().catch(() => null));
    const user = await sessionUser(req, deps, caller);
    const owner = { keyId: caller.kind === 'partner' ? caller.keyId : null, userId: user?.id ?? null };
    const run = await createRun(deps.db, deps.directions, input, owner, new URL(req.url).origin);
    return Response.json(run, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    if (err instanceof RunError) return jsonError(err.status, err.code, err.message);
    throw err;
  }
});
