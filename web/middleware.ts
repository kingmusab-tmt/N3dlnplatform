// CORS for the public API, so partners can also call it from browsers.
// Keyless (website) access is decided in lib/server/http.ts, not here.
import { NextResponse, type NextRequest } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Expose-Headers': 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining',
  'Access-Control-Max-Age': '600',
};

export function middleware(req: NextRequest) {
  if (req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
  const res = NextResponse.next();
  for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

export const config = { matcher: '/api/v1/:path*' };
