// DELETE /api/v1/admin/analytics?older_than_days=90 — delete raw visit data
// (visits and their page views) older than that; 0 deletes everything.
import { adminRoute } from '@/lib/server/admin';
import { CLEANUP_DAYS, deleteVisitData } from '@/lib/server/adminData';
import { jsonError } from '@/lib/server/http';

export const DELETE = adminRoute(async (req, { deps }) => {
  const days = Number(new URL(req.url).searchParams.get('older_than_days'));
  if (!(CLEANUP_DAYS as readonly number[]).includes(days)) {
    return jsonError(400, 'INVALID_DAYS', `older_than_days must be one of ${CLEANUP_DAYS.join(', ')} (0 = all).`);
  }
  const deleted = await deleteVisitData(deps.db, days);
  return Response.json({ deleted_visits: deleted.visits, deleted_pageviews: deleted.pageviews });
});
