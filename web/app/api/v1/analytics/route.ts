// POST /api/v1/analytics — page views and visit time from this website's own
// pages (components/Analytics.tsx). Internal: not part of the partner API.
import { deviceOf, isBot, isTrackedPath, parseEvent, recordEvent } from '@/lib/server/analytics';
import { apiRoute, clientIp, isSameOrigin, jsonError } from '@/lib/server/http';

// A visitor sends a view per page plus a ping every 15 s: well under this.
const EVENTS_PER_MIN_PER_IP = 120;

export const POST = apiRoute(
  async (req, { deps }) => {
    if (!isSameOrigin(req)) return jsonError(403, 'FORBIDDEN', 'Analytics events are only accepted from this website.');
    const ua = req.headers.get('user-agent');
    if (isBot(ua)) return new Response(null, { status: 204 });

    const limit = await deps.limiter.hit(`analytics:${clientIp(req)}`, EVENTS_PER_MIN_PER_IP, 60);
    if (!limit.allowed) return new Response(null, { status: 204 }); // drop quietly; never bother the visitor

    const event = parseEvent(await req.json().catch(() => null), new URL(req.url).hostname);
    if (!event) return jsonError(400, 'INVALID_EVENT', 'Malformed analytics event.');
    if (!isTrackedPath(event.path)) return new Response(null, { status: 204 });

    const country = req.headers.get('x-vercel-ip-country');
    await recordEvent(deps.db, event, {
      device: deviceOf(ua),
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
    });
    return new Response(null, { status: 204 });
  },
  { auth: false },
);
