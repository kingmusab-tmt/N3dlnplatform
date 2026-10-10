import type { Db } from './db';

export type LimitResult = { allowed: boolean; remaining: number; retryAfterSec: number };
/** Counts one request against `bucket`, allowing `max` per `windowSec`. */
export type Limiter = { hit: (bucket: string, max: number, windowSec: number) => Promise<LimitResult> };

// One atomic upsert per request. Window starts are aligned to multiples of the
// window length, so every instance agrees on which window "now" falls in.
const HIT_SQL = `
  WITH w AS (SELECT to_timestamp(floor(extract(epoch FROM now()) / $2::int) * $2::int) AS start)
  INSERT INTO rate_limits (bucket, window_start, count)
  SELECT $1, w.start, 1 FROM w
  ON CONFLICT (bucket, window_start) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count,
            ceil(extract(epoch FROM (window_start + make_interval(secs => $2::int) - now())))::int AS reset_in
`;
const CLEANUP_SQL = `DELETE FROM rate_limits WHERE window_start < now() - interval '2 hours'`;

/** Rate limiter shared across serverless instances via Postgres. */
export function createPostgresLimiter(db: Db): Limiter {
  return {
    async hit(bucket, max, windowSec) {
      const { rows } = await db.query(HIT_SQL, [bucket, windowSec]);
      // Occasionally prune old windows; fire-and-forget.
      if (Math.random() < 0.01) db.query(CLEANUP_SQL).catch(() => {});
      const count = Number(rows[0].count);
      return { allowed: count <= max, remaining: Math.max(0, max - count), retryAfterSec: Math.max(1, rows[0].reset_in) };
    },
  };
}

/** In-process limiter for tests and local experiments. */
export function createMemoryLimiter(): Limiter {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(bucket, max, windowSec) {
      const now = Date.now();
      const key = `${bucket}:${windowSec}`;
      let entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowSec * 1000 };
        hits.set(key, entry);
      }
      entry.count++;
      return {
        allowed: entry.count <= max,
        remaining: Math.max(0, max - entry.count),
        retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
      };
    },
  };
}
