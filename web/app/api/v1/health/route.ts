// GET /api/v1/health — public liveness and configuration check.
import { apiRoute } from '@/lib/server/http';

export const GET = apiRoute(
  async (_req, { deps }) =>
    Response.json({
      ok: true,
      nipost: deps.nipost ? `level ${deps.nipost.level}` : 'not configured',
      routing: deps.directions ? 'mapbox' : 'not configured',
    }),
  { auth: false },
);
