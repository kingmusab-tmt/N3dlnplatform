const isDev = process.env.NODE_ENV !== 'production';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

/**
 * Content-Security-Policy: only the origins the app actually uses.
 * - Mapbox GL needs blob: workers and its API/tile hosts.
 * - Supabase Auth is called from the browser (sign-in codes).
 * - The API docs page loads Swagger UI from jsDelivr.
 * - 'unsafe-inline' scripts are needed for Next.js's inline bootstrap without
 *   per-request nonces (which would make every page dynamic); 'unsafe-eval'
 *   only in development, for React Fast Refresh.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https://*.mapbox.com",
  "font-src 'self' data:",
  `connect-src 'self' https://*.mapbox.com${supabaseUrl ? ` ${supabaseUrl}` : ''}${isDev ? ' ws: http://127.0.0.1:54321' : ''}`,
  "worker-src 'self' blob:",
  "child-src blob:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Location for navigation and pin-drop; camera for proof-of-delivery photos; nothing else.
  { key: 'Permissions-Policy', value: 'geolocation=(self), camera=(self), microphone=(), payment=(), usb=(), interest-cohort=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Lets a production build be checked locally next to a running dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // The spec is read from disk at runtime; make sure it ships with the function.
  outputFileTracingIncludes: {
    '/api/v1/openapi.yaml': ['./openapi.yaml'],
  },
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ];
  },
};

export default nextConfig;
