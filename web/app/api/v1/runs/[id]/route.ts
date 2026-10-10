// GET /api/v1/runs/:id — the run's stops and their status, for the rider's phone.
import { runRoute } from '@/lib/server/runRoute';
import { getRun } from '@/lib/server/runs';

export const GET = runRoute<{ id: string }>(async (req, { deps, run }) =>
  Response.json(await getRun(deps.db, run, new URL(req.url).origin), { headers: { 'Cache-Control': 'no-store' } }),
);
