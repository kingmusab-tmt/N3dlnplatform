// POST /api/v1/runs/:id/position — the rider's phone reports where it is.
import { isLngLat, jsonError } from '@/lib/server/http';
import { runRoute } from '@/lib/server/runRoute';
import { updatePosition } from '@/lib/server/runs';

export const POST = runRoute<{ id: string }>(async (req, { deps, run }) => {
  const body = await req.json().catch(() => null);
  const lng = Number(body?.lng);
  const lat = Number(body?.lat);
  if (!isLngLat(lng, lat)) return jsonError(400, 'INVALID_POSITION', 'lng and lat must be valid WGS84 coordinates.');
  if (run.status !== 'active') return jsonError(409, 'RUN_ENDED', 'This run has ended.');
  await updatePosition(deps.db, run.id, {
    lng,
    lat,
    heading: Number(body?.heading),
    current_stop: body?.current_stop,
    remaining_m: Number(body?.remaining_m),
    eta_s: Number(body?.eta_s),
    arrived: body?.arrived === true,
  });
  return new Response(null, { status: 204 });
});
