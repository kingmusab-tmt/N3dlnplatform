// Shared plumbing for /api/v1 route handlers: authentication, rate limiting
// and uniform JSON errors.
import type { SessionUser } from './auth';
import { getDeps, type Deps } from './deps';

/** Who is calling: a partner with an API key, or a visitor using this website. */
export type Caller = { kind: 'partner'; keyId: number; name: string } | { kind: 'web'; ip: string };

type Handler<P> = (req: Request, ctx: { params: P; deps: Deps; caller: Caller }) => Promise<Response>;

export const WEB_LIMIT_PER_MIN = 60;

export function jsonError(status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error, message, ...extra }, { status });
}

export function rateLimited(retryAfterSec: number) {
  return Response.json(
    { error: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

/** Stable identity for per-caller limits (e.g. claims per hour). */
export function callerBucket(caller: Caller) {
  return caller.kind === 'partner' ? `key:${caller.keyId}` : `ip:${caller.ip}`;
}

/**
 * Wraps a handler with auth and limits.
 *
 * - `X-API-Key` present: must be a valid partner key; limited per key.
 * - No key, request from this site's own pages (same-origin): treated as a
 *   website visitor; limited per IP. Browsers set Sec-Fetch-Site/Origin/Referer
 *   and pages can't forge them; scripts can, which is why that path is only
 *   as generous as one human visitor needs.
 * - Otherwise: 401.
 */
export function apiRoute<P = Record<string, never>>(handler: Handler<P>, { auth = true } = {}) {
  return async (req: Request, { params }: { params: Promise<P> }) => {
    try {
      const deps = getDeps();
      const resolvedParams = await params;
      if (!auth) {
        return await handler(req, { params: resolvedParams, deps, caller: { kind: 'web', ip: clientIp(req) } });
      }

      let caller: Caller;
      let limit: number;
      let bucket: string;
      const key = req.headers.get('x-api-key');
      if (key) {
        const record = await deps.keys.find(key);
        if (!record) return jsonError(401, 'INVALID_API_KEY', 'The API key is invalid or has been revoked.');
        caller = { kind: 'partner', keyId: record.id, name: record.name };
        limit = record.rate_limit_per_min;
        bucket = `key:${record.id}`;
      } else if (isSameOrigin(req)) {
        caller = { kind: 'web', ip: clientIp(req) };
        limit = WEB_LIMIT_PER_MIN;
        bucket = `web:${caller.ip}`;
      } else {
        return jsonError(401, 'API_KEY_REQUIRED', 'Send your API key in the X-API-Key header. See /api/v1/docs.');
      }

      const result = await deps.limiter.hit(bucket, limit, 60);
      if (!result.allowed) return withRateHeaders(rateLimited(result.retryAfterSec), limit, 0);

      const res = await handler(req, { params: resolvedParams, deps, caller });
      return withRateHeaders(res, limit, result.remaining);
    } catch (err) {
      console.error(err);
      return jsonError(500, 'INTERNAL_ERROR', 'Something went wrong.');
    }
  };
}

function withRateHeaders(res: Response, limit: number, remaining: number) {
  res.headers.set('X-RateLimit-Limit', String(limit));
  res.headers.set('X-RateLimit-Remaining', String(remaining));
  return res;
}

export function isSameOrigin(req: Request) {
  const self = new URL(req.url).origin;
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const origin = req.headers.get('origin');
  if (origin) return origin === self;
  const referer = req.headers.get('referer');
  return !!referer && referer.startsWith(`${self}/`);
}

/** Visitor IP. Vercel sets these headers itself, so clients can't spoof them there. */
export function clientIp(req: Request) {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export function parseLngLat(value: string | null): [number, number] | null {
  if (!value) return null;
  const [lng, lat] = value.split(',').map(Number);
  return isLngLat(lng, lat) ? [lng, lat] : null;
}

export function isLngLat(lng: number, lat: number) {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

/**
 * The signed-in website user, or null. Partner API-key calls never have a
 * user: accounts belong to people using this website.
 */
export async function sessionUser(req: Request, deps: Deps, caller: Caller): Promise<SessionUser | null> {
  return caller.kind === 'web' ? deps.auth.getUser(req) : null;
}

export function signInRequired() {
  return jsonError(401, 'SIGN_IN_REQUIRED', 'Sign in on this website to manage your places.');
}
