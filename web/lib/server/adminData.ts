// Read models for the admin dashboard. Plain SQL over the app's own tables;
// days are counted in Nigerian time (Africa/Lagos).
import 'server-only';
import type { Db } from './db';

export const RANGES = {
  '24h': { label: 'Last 24 hours', interval: '24 hours', days: 1 },
  '7d': { label: 'Last 7 days', interval: '7 days', days: 7 },
  '30d': { label: 'Last 30 days', interval: '30 days', days: 30 },
  '90d': { label: 'Last 90 days', interval: '90 days', days: 90 },
} as const;
export type RangeId = keyof typeof RANGES;

export function parseRange(value: unknown): RangeId {
  return typeof value === 'string' && value in RANGES ? (value as RangeId) : '7d';
}

const TZ = 'Africa/Lagos';
const num = (v: unknown) => Number(v ?? 0);

export type VisitorSummary = {
  visitors: number;
  newVisitors: number;
  visits: number;
  pageviews: number;
  avgSeconds: number;
  medianSeconds: number;
  totalSeconds: number;
  /** One page and under 10 seconds. */
  bounces: number;
  liveNow: number;
};

export async function visitorSummary(db: Db, range: RangeId): Promise<VisitorSummary> {
  const { rows } = await db.query(
    `WITH s AS (SELECT * FROM analytics_sessions WHERE started_at >= now() - $1::interval)
     SELECT count(DISTINCT visitor_id) AS visitors,
            count(DISTINCT visitor_id) FILTER (
              WHERE NOT EXISTS (SELECT 1 FROM analytics_sessions o
                                WHERE o.visitor_id = s.visitor_id AND o.started_at < now() - $1::interval)
            ) AS new_visitors,
            count(*) AS visits,
            coalesce(sum(pageviews), 0) AS pageviews,
            coalesce(avg(active_seconds), 0) AS avg_seconds,
            coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY active_seconds), 0) AS median_seconds,
            coalesce(sum(active_seconds), 0) AS total_seconds,
            count(*) FILTER (WHERE pageviews <= 1 AND active_seconds < 10) AS bounces,
            (SELECT count(DISTINCT visitor_id) FROM analytics_sessions WHERE last_seen_at > now() - interval '2 minutes') AS live_now
     FROM s`,
    [RANGES[range].interval],
  );
  const r = rows[0];
  return {
    visitors: num(r.visitors),
    newVisitors: num(r.new_visitors),
    visits: num(r.visits),
    pageviews: num(r.pageviews),
    avgSeconds: Math.round(num(r.avg_seconds)),
    medianSeconds: Math.round(num(r.median_seconds)),
    totalSeconds: num(r.total_seconds),
    bounces: num(r.bounces),
    liveNow: num(r.live_now),
  };
}

export type DayPoint = { day: string; visitors: number; visits: number; pageviews: number; avgSeconds: number };

/** One point per day (or per hour for the 24-hour range), including empty ones. */
export async function visitorTrend(db: Db, range: RangeId): Promise<{ unit: 'day' | 'hour'; points: DayPoint[] }> {
  const unit = range === '24h' ? 'hour' : 'day';
  const { rows } = await db.query(
    `WITH buckets AS (
       SELECT generate_series(
         date_trunc($2, now() AT TIME ZONE '${TZ}') - ($3::int - 1) * ('1 ' || $2)::interval,
         date_trunc($2, now() AT TIME ZONE '${TZ}'),
         ('1 ' || $2)::interval
       ) AS bucket
     ),
     s AS (
       SELECT date_trunc($2, started_at AT TIME ZONE '${TZ}') AS bucket, visitor_id, pageviews, active_seconds
       FROM analytics_sessions WHERE started_at >= now() - $1::interval - interval '1 day'
     )
     SELECT to_char(b.bucket, CASE WHEN $2 = 'hour' THEN 'YYYY-MM-DD"T"HH24:00' ELSE 'YYYY-MM-DD' END) AS day,
            count(DISTINCT s.visitor_id) AS visitors,
            count(s.visitor_id) AS visits,
            coalesce(sum(s.pageviews), 0) AS pageviews,
            coalesce(avg(s.active_seconds), 0) AS avg_seconds
     FROM buckets b LEFT JOIN s ON s.bucket = b.bucket
     GROUP BY b.bucket ORDER BY b.bucket`,
    [RANGES[range].interval, unit, unit === 'hour' ? 24 : RANGES[range].days],
  );
  return {
    unit,
    points: rows.map((r) => ({
      day: r.day,
      visitors: num(r.visitors),
      visits: num(r.visits),
      pageviews: num(r.pageviews),
      avgSeconds: Math.round(num(r.avg_seconds)),
    })),
  };
}

export const DURATION_BUCKETS = [
  { label: 'Under 10 s', max: 10 },
  { label: '10–30 s', max: 30 },
  { label: '30 s–1 min', max: 60 },
  { label: '1–3 min', max: 180 },
  { label: '3–10 min', max: 600 },
  { label: '10–30 min', max: 1800 },
  { label: '30 min +', max: Infinity },
];

/** How many visits lasted how long. */
export async function durationBreakdown(db: Db, range: RangeId) {
  const { rows } = await db.query(
    `SELECT active_seconds FROM analytics_sessions WHERE started_at >= now() - $1::interval`,
    [RANGES[range].interval],
  );
  const counts = DURATION_BUCKETS.map((b) => ({ label: b.label, visits: 0 }));
  for (const r of rows) {
    const s = num(r.active_seconds);
    counts[DURATION_BUCKETS.findIndex((b) => s < b.max)].visits++;
  }
  return counts;
}

export type Ranked = { label: string; visits: number; visitors: number; extra?: number };

/** Top pages, referrers, devices and countries for the range. */
export async function visitorBreakdowns(db: Db, range: RangeId) {
  const interval = RANGES[range].interval;
  const group = async (expr: string): Promise<Ranked[]> => {
    const { rows } = await db.query(
      `SELECT ${expr} AS label, count(*) AS visits, count(DISTINCT visitor_id) AS visitors
       FROM analytics_sessions WHERE started_at >= now() - $1::interval
       GROUP BY 1 ORDER BY visits DESC LIMIT 10`,
      [interval],
    );
    return rows.map((r) => ({ label: r.label, visits: num(r.visits), visitors: num(r.visitors) }));
  };
  const pages = await db.query(
    `SELECT p.path AS label, count(*) AS views, count(DISTINCT s.visitor_id) AS visitors
     FROM analytics_pageviews p JOIN analytics_sessions s ON s.id = p.session_id
     WHERE p.at >= now() - $1::interval
     GROUP BY p.path ORDER BY views DESC LIMIT 12`,
    [interval],
  );
  return {
    pages: pages.rows.map((r) => ({ label: r.label, visits: num(r.views), visitors: num(r.visitors) })),
    entryPages: await group('entry_path'),
    referrers: await group(`coalesce(referrer_host, 'Direct / unknown')`),
    devices: await group('device'),
    countries: await group(`coalesce(country, 'Unknown')`),
  };
}

export type RecentVisit = {
  started_at: string;
  active_seconds: number;
  pageviews: number;
  entry_path: string;
  device: string;
  country: string | null;
  referrer_host: string | null;
  returning: boolean;
};

export async function recentVisits(db: Db, limit = 25): Promise<RecentVisit[]> {
  const { rows } = await db.query(
    `SELECT s.started_at, s.active_seconds, s.pageviews, s.entry_path, s.device, s.country, s.referrer_host,
            EXISTS (SELECT 1 FROM analytics_sessions o WHERE o.visitor_id = s.visitor_id AND o.started_at < s.started_at) AS returning
     FROM analytics_sessions s ORDER BY s.started_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({ ...r, started_at: new Date(r.started_at).toISOString() }));
}

export type PlatformTotals = {
  buildings: number;
  users: number;
  newUsers: number;
  places: number;
  newPlaces: number;
  runs: number;
  activeRuns: number;
  delivered: number;
  apiKeys: number;
};

export async function platformTotals(db: Db, range: RangeId): Promise<PlatformTotals> {
  const { rows } = await db.query(
    `SELECT (SELECT count(*) FROM buildings) AS buildings,
            (SELECT count(*) FROM auth.users) AS users,
            (SELECT count(*) FROM auth.users WHERE created_at >= now() - $1::interval) AS new_users,
            (SELECT count(*) FROM claims) AS places,
            (SELECT count(*) FROM claims WHERE created_at >= now() - $1::interval) AS new_places,
            (SELECT count(*) FROM delivery_runs) AS runs,
            (SELECT count(*) FROM delivery_runs WHERE status = 'active') AS active_runs,
            (SELECT count(*) FROM deliveries WHERE status = 'delivered') AS delivered,
            (SELECT count(*) FROM api_keys WHERE revoked_at IS NULL) AS api_keys`,
    [RANGES[range].interval],
  );
  const r = rows[0];
  return {
    buildings: num(r.buildings),
    users: num(r.users),
    newUsers: num(r.new_users),
    places: num(r.places),
    newPlaces: num(r.new_places),
    runs: num(r.runs),
    activeRuns: num(r.active_runs),
    delivered: num(r.delivered),
    apiKeys: num(r.api_keys),
  };
}

// ---- Lists -------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  places: number;
  is_admin: boolean;
};

export async function listUsers(db: Db, search: string | null, limit = 200): Promise<AdminUserRow[]> {
  const { rows } = await db.query(
    `SELECT u.id, u.email, u.phone, u.created_at, u.last_sign_in_at,
            (SELECT count(*) FROM claims c WHERE c.user_id = u.id)::int AS places,
            EXISTS (SELECT 1 FROM admin_users a WHERE a.user_id = u.id) AS is_admin
     FROM auth.users u
     WHERE $1::text IS NULL OR u.email ILIKE '%' || $1 || '%' OR u.phone ILIKE '%' || $1 || '%'
     ORDER BY u.created_at DESC LIMIT $2`,
    [search?.trim() || null, limit],
  );
  return rows.map((r) => ({
    ...r,
    phone: r.phone || null,
    email: r.email || null,
    created_at: new Date(r.created_at).toISOString(),
    last_sign_in_at: r.last_sign_in_at ? new Date(r.last_sign_in_at).toISOString() : null,
  }));
}

export type AdminPlaceRow = {
  id: string;
  label: string;
  delivery_notes: string | null;
  nipost_code: string;
  building_name: string | null;
  owner: string | null;
  has_gate: boolean;
  created_at: string;
};

export async function listPlaces(db: Db, search: string | null, limit = 200): Promise<AdminPlaceRow[]> {
  const { rows } = await db.query(
    `SELECT c.id, c.label, c.delivery_notes, b.nipost_code, b.metadata->>'name' AS building_name,
            coalesce(u.email, nullif(u.phone, '')) AS owner, (c.gate_lng IS NOT NULL) AS has_gate, c.created_at
     FROM claims c
     JOIN buildings b ON b.id = c.building_id
     LEFT JOIN auth.users u ON u.id = c.user_id
     WHERE $1::text IS NULL OR c.label ILIKE '%' || $1 || '%' OR b.nipost_code ILIKE '%' || replace($1, ' ', '') || '%'
        OR c.delivery_notes ILIKE '%' || $1 || '%' OR u.email ILIKE '%' || $1 || '%'
     ORDER BY c.created_at DESC LIMIT $2`,
    [search?.trim() || null, limit],
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}

export type AdminRunRow = {
  id: string;
  status: string;
  profile: string;
  created_by: string;
  stops: number;
  delivered: number;
  failed: number;
  created_at: string;
  ended_at: string | null;
  position_at: string | null;
};

export async function listRuns(db: Db, limit = 100): Promise<AdminRunRow[]> {
  const { rows } = await db.query(
    `SELECT r.id, r.status, r.profile, r.created_at, r.ended_at, r.position_at,
            coalesce('API: ' || k.name, u.email, nullif(u.phone, ''), 'Website') AS created_by,
            count(d.id)::int AS stops,
            count(d.id) FILTER (WHERE d.status = 'delivered')::int AS delivered,
            count(d.id) FILTER (WHERE d.status = 'failed')::int AS failed
     FROM delivery_runs r
     LEFT JOIN deliveries d ON d.run_id = r.id
     LEFT JOIN api_keys k ON k.id = r.created_by_key_id
     LEFT JOIN auth.users u ON u.id = r.created_by_user_id
     GROUP BY r.id, k.name, u.email, u.phone
     ORDER BY r.created_at DESC LIMIT $1`,
    [limit],
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({ ...r, created_at: iso(r.created_at)!, ended_at: iso(r.ended_at), position_at: iso(r.position_at) }));
}

export type AdminKeyRow = {
  id: number;
  name: string;
  key_prefix: string;
  rate_limit_per_min: number;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  runs: number;
};

export async function listKeys(db: Db): Promise<AdminKeyRow[]> {
  const { rows } = await db.query(
    `SELECT k.id, k.name, k.key_prefix, k.rate_limit_per_min, k.created_at, k.last_used_at, k.revoked_at,
            (SELECT count(*) FROM delivery_runs r WHERE r.created_by_key_id = k.id)::int AS runs
     FROM api_keys k ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC`,
  );
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return rows.map((r) => ({ ...r, id: Number(r.id), created_at: iso(r.created_at)!, last_used_at: iso(r.last_used_at), revoked_at: iso(r.revoked_at) }));
}

export type AdminRow = { user_id: string; email: string | null; phone: string | null; created_at: string; added_by: string | null };

export async function listAdmins(db: Db): Promise<AdminRow[]> {
  const { rows } = await db.query(
    `SELECT a.user_id, u.email, nullif(u.phone, '') AS phone, a.created_at, coalesce(b.email, nullif(b.phone, '')) AS added_by
     FROM admin_users a JOIN auth.users u ON u.id = a.user_id LEFT JOIN auth.users b ON b.id = a.added_by
     ORDER BY a.created_at`,
  );
  return rows.map((r) => ({ ...r, created_at: new Date(r.created_at).toISOString() }));
}
