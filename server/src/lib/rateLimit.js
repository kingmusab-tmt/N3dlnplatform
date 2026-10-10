// Fixed-window rate limiting, in memory. Limits reset on restart and aren't
// shared across instances: fine for the MVP, swap for Redis before scaling out.

/** A set of counters for one window length; `hit(key, max)` counts one request. */
export function createWindowCounter({ windowMs }) {
  const hits = new Map();

  return function hit(key, max) {
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    return {
      allowed: entry.count <= max,
      remaining: Math.max(0, max - entry.count),
      retryAfterSec: Math.ceil((entry.resetAt - now) / 1000),
    };
  };
}

export function sendRateLimited(res, retryAfterSec) {
  res.set('Retry-After', String(retryAfterSec));
  return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
}

/** Express middleware: at most `max` requests per `windowMs` per client. */
export function rateLimit({ windowMs, max, keyOf = clientKey }) {
  const hit = createWindowCounter({ windowMs });
  return (req, res, next) => {
    const result = hit(keyOf(req), max);
    return result.allowed ? next() : sendRateLimited(res, result.retryAfterSec);
  };
}

/** The end user behind a request: their forwarded IP for first-party traffic, else the socket IP. */
export function clientKey(req) {
  return req.apiKey?.kind === 'first_party' ? `ip:${req.apiKey.clientIp}` : `ip:${req.ip}`;
}
