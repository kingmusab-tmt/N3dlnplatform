// First-party visitor analytics: page views and how long visits last.
// The browser sends a 'view' on each page and a 'ping' with the seconds the
// page was visible since the last one (every ~15 s, and when it's hidden).
import type { Db } from './db';

export type AnalyticsEvent = {
  visitor: string;
  session: string;
  type: 'view' | 'ping';
  path: string;
  /** Seconds the page was visible since the last event. */
  active: number;
  referrer: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Pings come every 15 s; anything claiming much more is clipped. */
export const MAX_ACTIVE_PER_EVENT = 30;
/** A visit ends after this long without activity. */
export const SESSION_IDLE_MIN = 30;

// Paths that carry private tokens or ids are recorded by shape only.
const PRIVATE_SEGMENTS: [RegExp, string][] = [
  [/^\/t\/[^/]+/, '/t/[token]'],
  [/^\/h\/[^/]+/, '/h/[id]'],
];

/** Path without query/hash or private tokens, e.g. "/t/abc?x" -> "/t/[token]". */
export function normalizePath(raw: string) {
  let path = raw.split(/[?#]/)[0] || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  for (const [pattern, replacement] of PRIVATE_SEGMENTS) path = path.replace(pattern, replacement);
  if (path.length > 1) path = path.replace(/\/+$/, '');
  return path.slice(0, 200);
}

/** Pages that aren't counted: the admin area itself, and the API. */
export function isTrackedPath(path: string) {
  return !/^\/(admin|api)(\/|$)/.test(path);
}

/** `ownHost`: this site's hostname, so internal navigation isn't counted as a referrer. */
export function parseEvent(body: unknown, ownHost?: string): AnalyticsEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.v !== 'string' || !UUID.test(b.v)) return null;
  if (typeof b.s !== 'string' || !UUID.test(b.s)) return null;
  if (b.t !== 'view' && b.t !== 'ping') return null;
  if (typeof b.p !== 'string' || b.p.length > 2000) return null;
  const active = typeof b.a === 'number' && Number.isFinite(b.a) ? Math.round(Math.min(Math.max(b.a, 0), MAX_ACTIVE_PER_EVENT)) : 0;
  return {
    visitor: b.v.toLowerCase(),
    session: b.s.toLowerCase(),
    type: b.t,
    path: normalizePath(b.p),
    active,
    referrer: typeof b.r === 'string' ? referrerHost(b.r, ownHost) : null,
  };
}

/** Just the host of an external referrer ("google.com"), never the full URL. */
export function referrerHost(raw: string, ownHost?: string) {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '').toLowerCase();
    if (!host || host === ownHost) return null;
    return host.slice(0, 100);
  } catch {
    return null;
  }
}

export function deviceOf(userAgent: string | null): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent ?? '';
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function isBot(userAgent: string | null) {
  return !userAgent || /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|preview|lighthouse|pingdom|uptime/i.test(userAgent);
}

// A view opens the visit (or continues it) and counts the page.
const VIEW_SQL = `
  WITH s AS (
    INSERT INTO analytics_sessions (id, visitor_id, entry_path, referrer_host, device, country, pageviews, active_seconds)
    VALUES ($1, $2, $3, $4, $5, $6, 1, $7)
    ON CONFLICT (id) DO UPDATE
      SET pageviews = analytics_sessions.pageviews + 1,
          active_seconds = analytics_sessions.active_seconds
            + LEAST($7, GREATEST(0, extract(epoch FROM now() - analytics_sessions.last_seen_at)::int + 5)),
          last_seen_at = now()
      WHERE analytics_sessions.visitor_id = EXCLUDED.visitor_id
        AND analytics_sessions.last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MIN})
    RETURNING id
  )
  INSERT INTO analytics_pageviews (session_id, path) SELECT id, $3 FROM s
`;

// A ping adds visible time, never more than the wall-clock time since the
// last event (plus a little slack), so a forged client can't inflate it much.
const PING_SQL = `
  UPDATE analytics_sessions
     SET active_seconds = active_seconds + LEAST($3, GREATEST(0, extract(epoch FROM now() - last_seen_at)::int + 5)),
         last_seen_at = now()
   WHERE id = $1 AND visitor_id = $2
     AND last_seen_at > now() - make_interval(mins => ${SESSION_IDLE_MIN})
`;

export async function recordEvent(
  db: Db,
  event: AnalyticsEvent,
  context: { device: 'mobile' | 'tablet' | 'desktop'; country: string | null },
) {
  if (event.type === 'view') {
    await db.query(VIEW_SQL, [event.session, event.visitor, event.path, event.referrer, context.device, context.country, event.active]);
  } else if (event.active > 0) {
    await db.query(PING_SQL, [event.session, event.visitor, event.active]);
  }
}
