import { createHash, randomBytes } from 'node:crypto';
import { createWindowCounter, sendRateLimited } from './rateLimit.js';

const PREFIXES = { partner: 'n3d_live_', first_party: 'n3d_web_' };
const KEY_PATTERN = /^n3d_(live|web)_[A-Za-z0-9_-]{32}$/;

export function hashKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

/** New random key: 24 bytes of entropy as base64url (32 chars) after a kind prefix. */
export function generateKey(kind = 'partner') {
  const prefix = PREFIXES[kind];
  if (!prefix) throw new Error(`Unknown key kind: ${kind}`);
  const key = `${prefix}${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashKey(key), displayPrefix: key.slice(0, prefix.length + 6) };
}

const LOOKUP_SQL = `
  SELECT id, name, kind, rate_limit_per_min
  FROM api_keys
  WHERE key_hash = $1 AND revoked_at IS NULL
`;
const TOUCH_SQL = 'UPDATE api_keys SET last_used_at = now() WHERE id = $1';

/**
 * Express middleware requiring a valid X-API-Key, with per-key rate limits.
 *
 * Lookups are cached for `cacheTtlMs`, so a revoked key keeps working for at
 * most that long. last_used_at is written at most once a minute per key.
 */
export function apiKeyAuth(db, { cacheTtlMs = 60_000, firstPartyPerIpLimit = 60 } = {}) {
  const cache = new Map();
  const lastTouched = new Map();
  const perMinute = createWindowCounter({ windowMs: 60_000 });

  async function resolve(key) {
    const hash = hashKey(key);
    const hit = cache.get(hash);
    if (hit && hit.expires > Date.now()) return hit.record;

    const { rows } = await db.query(LOOKUP_SQL, [hash]);
    const record = rows[0] ?? null;
    if (cache.size > 5_000) cache.clear();
    cache.set(hash, { record, expires: Date.now() + cacheTtlMs });
    return record;
  }

  function touch(record) {
    const now = Date.now();
    if ((lastTouched.get(record.id) ?? 0) > now - 60_000) return;
    lastTouched.set(record.id, now);
    db.query(TOUCH_SQL, [record.id]).catch((err) => console.warn('api_keys last_used_at update failed:', err.message));
  }

  return async (req, res, next) => {
    const key = req.get('X-API-Key');
    if (!key) {
      return res.status(401).json({
        error: 'API_KEY_REQUIRED',
        message: 'Send your API key in the X-API-Key header. See /api/v1/docs.',
      });
    }
    if (!KEY_PATTERN.test(key)) {
      return res.status(401).json({ error: 'INVALID_API_KEY', message: 'The API key is invalid or has been revoked.' });
    }

    try {
      const record = await resolve(key);
      if (!record) {
        return res.status(401).json({ error: 'INVALID_API_KEY', message: 'The API key is invalid or has been revoked.' });
      }

      // First-party traffic (our web app) is limited per end user, identified by
      // the IP our proxy forwards; this header is only trusted for that key kind.
      const clientIp = record.kind === 'first_party' ? forwardedIp(req) ?? req.ip : req.ip;
      const bucket = record.kind === 'first_party' ? `key:${record.id}:ip:${clientIp}` : `key:${record.id}`;
      const limit = record.kind === 'first_party' ? firstPartyPerIpLimit : record.rate_limit_per_min;

      const result = perMinute(bucket, limit);
      res.set('X-RateLimit-Limit', String(limit));
      res.set('X-RateLimit-Remaining', String(result.remaining));
      if (!result.allowed) return sendRateLimited(res, result.retryAfterSec);

      req.apiKey = { id: record.id, name: record.name, kind: record.kind, clientIp };
      touch(record);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

function forwardedIp(req) {
  const first = req.get('X-Forwarded-For')?.split(',')[0]?.trim();
  return first || null;
}
