// Same-origin proxy from the browser to the Express API.
//
// The browser never sees an API key: this handler attaches the web app's
// first-party key (API_KEY, server-only) and forwards the visitor's IP so the
// API can rate-limit each visitor separately. A request that already carries
// its own X-API-Key (a partner trying the docs) is passed through unchanged.
import type { NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const API_KEY = process.env.API_KEY;
if (!API_KEY) console.warn('API_KEY is not set in web/.env.local: API calls from the site will be rejected (401).');

const PASS_THROUGH_RESPONSE_HEADERS = [
  'content-type',
  'cache-control',
  'retry-after',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
];

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const target = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, API_URL);
  target.search = req.nextUrl.search;

  const headers = new Headers({ 'X-Forwarded-For': clientIp(req) });
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const key = req.headers.get('x-api-key') || API_KEY;
  if (key) headers.set('X-API-Key', key);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
      cache: 'no-store',
    });
  } catch {
    return Response.json({ error: 'API_UNAVAILABLE', message: 'The API server is not reachable.' }, { status: 502 });
  }

  const out = new Headers();
  for (const name of PASS_THROUGH_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

/**
 * The visitor's IP. Vercel and most reverse proxies overwrite these headers,
 * so they can be trusted there; when self-hosting, run behind such a proxy or
 * visitors could spoof them to dodge per-IP limits.
 */
function clientIp(req: NextRequest) {
  return req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
}

export { proxy as GET, proxy as POST };
