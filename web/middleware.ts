// Runs before pages and API routes:
//  1. Keeps the Supabase Auth session fresh, rewriting its cookies when the
//     access token is refreshed (route handlers only read them).
//  2. CORS for the public API, so partners can also call it from browsers.
//     Keyless (website) access is decided in lib/server/http.ts, not here.
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
  'Access-Control-Expose-Headers': 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining',
  'Access-Control-Max-Age': '600',
};

export async function middleware(req: NextRequest) {
  const isApi = req.nextUrl.pathname.startsWith('/api/v1');
  if (isApi && req.method === 'OPTIONS') return new NextResponse(null, { status: 204, headers: CORS_HEADERS });

  let res = NextResponse.next({ request: req });

  if (SUPABASE_URL && SUPABASE_KEY && hasSessionCookie(req)) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          for (const { name, value } of cookies) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of cookies) res.cookies.set(name, value, options);
        },
      },
    });
    // Verifies the session and refreshes it if the access token has expired.
    await supabase.auth.getClaims();
  }

  if (isApi) for (const [k, v] of Object.entries(CORS_HEADERS)) res.headers.set(k, v);
  return res;
}

/** Skip the auth round trip entirely for visitors who never signed in. */
function hasSessionCookie(req: NextRequest) {
  return req.cookies.getAll().some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'));
}

export const config = {
  // Everything except static assets and map tiles (public, cached, and loaded by the dozen).
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/v1/tiles).*)'],
};
