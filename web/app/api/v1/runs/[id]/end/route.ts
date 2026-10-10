// POST /api/v1/runs/:id/end — stop the run early; unfinished stops are marked failed.
import { runRoute } from '@/lib/server/runRoute';
import { endRun } from '@/lib/server/runs';

export const POST = runRoute<{ id: string }>(async (_req, { deps, run }) => {
  await endRun(deps.db, run.id);
  return new Response(null, { status: 204 });
});
