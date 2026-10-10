// Minimal fixed-window, per-IP rate limiter for public write endpoints.
// In-memory, so limits reset on restart and aren't shared across instances;
// good enough for the MVP, swap for a shared store before scaling out.
export function rateLimit({ windowMs, max }) {
  const hits = new Map();

  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' });
    }
    return next();
  };
}
