// GET /api/v1/track/:token/photo — the proof-of-delivery photo, for the customer.
import { apiRoute, jsonError } from '@/lib/server/http';
import { getTrackingPhoto } from '@/lib/server/runs';

export const GET = apiRoute<{ token: string }>(
  async (_req, { params, deps }) => {
    const photo = await getTrackingPhoto(deps.db, params.token);
    if (!photo) return jsonError(404, 'PHOTO_NOT_FOUND', 'No delivery photo for this link.');
    return new Response(new Uint8Array(photo.data), {
      headers: { 'Content-Type': photo.content_type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  },
  { auth: false },
);
