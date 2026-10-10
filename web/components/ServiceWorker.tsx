'use client';

import { useEffect } from 'react';

/**
 * Registers the offline service worker (public/sw.js) in production builds.
 * Not in development: cached pages would hide your code changes.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline support is a bonus; the site works without it.
    });
  }, []);
  return null;
}
