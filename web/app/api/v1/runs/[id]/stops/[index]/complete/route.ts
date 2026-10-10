// POST /api/v1/runs/:id/stops/:index/complete — proof of delivery for a stop:
// the customer's 4-digit code (if the stop has one) and/or a photo.
import { jsonError } from '@/lib/server/http';
import { runRoute } from '@/lib/server/runRoute';
import { completeStop } from '@/lib/server/runs';

// Wrong codes allowed per stop per 15 minutes, so codes can't be guessed.
const CODE_ATTEMPTS = 5;

export const POST = runRoute<{ id: string; index: string }>(async (req, { params, deps, run }) => {
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) return jsonError(400, 'INVALID_STOP', 'Stop index must be a whole number.');
  const body = await req.json().catch(() => null);
  const result = await completeStop(deps.db, run.id, index, body ?? {}, async () => {
    const attempt = await deps.limiter.hit(`pod:${run.id}:${index}`, CODE_ATTEMPTS, 900);
    return attempt.allowed;
  });
  return Response.json(result);
});
