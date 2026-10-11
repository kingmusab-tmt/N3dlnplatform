'use client';
// Counts page views and how long visits last, for the admin dashboard.
// A random visitor id and visit id live in this browser's localStorage: no
// cookies, nothing personal. Browsers asking not to be tracked (Global
// Privacy Control / Do Not Track) send nothing.
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

const ENDPOINT = '/api/v1/analytics';
const STORE_KEY = 'tmt-analytics';
const PING_MS = 15_000;
// Must match SESSION_IDLE_MIN on the server.
const IDLE_MS = 30 * 60_000;

type Ids = { visitor: string; session: string; lastActive: number };

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

let memoryIds: Ids | null = null; // when localStorage is unavailable

/** This browser's ids, starting a new visit after 30 idle minutes. */
function currentIds(): Ids {
  let ids: Ids | null = memoryIds;
  try {
    ids = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    // private mode or blocked storage: keep ids in memory for this page
  }
  const now = Date.now();
  if (!ids?.visitor) ids = { visitor: uuid(), session: uuid(), lastActive: now };
  if (now - ids.lastActive > IDLE_MS) ids = { ...ids, session: uuid() };
  ids.lastActive = now;
  memoryIds = ids;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(ids));
  } catch {}
  return ids;
}

function optedOut() {
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === '1';
}

function send(body: Record<string, unknown>, beacon = false) {
  const json = JSON.stringify(body);
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon(ENDPOINT, new Blob([json], { type: 'application/json' }));
    return;
  }
  void fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, keepalive: true }).catch(() => {});
}

export default function Analytics() {
  const pathname = usePathname();
  const visibleSince = useRef<number | null>(null);
  const tracked = !pathname.startsWith('/admin');

  // Seconds visible since the last report.
  const takeActive = () => {
    if (visibleSince.current === null) return 0;
    const now = Date.now();
    const seconds = (now - visibleSince.current) / 1000;
    visibleSince.current = document.visibilityState === 'visible' ? now : null;
    return Math.round(seconds);
  };

  // A view per page (path only; the query string can hold private ids).
  useEffect(() => {
    if (!tracked || optedOut()) return;
    const ids = currentIds();
    const active = takeActive(); // time on the previous page
    visibleSince.current = document.visibilityState === 'visible' ? Date.now() : null;
    const referrer = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : null;
    send({ v: ids.visitor, s: ids.session, t: 'view', p: pathname, a: active, r: referrer });
  }, [pathname, tracked]);

  // Heartbeats while visible, and a last report when the page is hidden or closed.
  useEffect(() => {
    if (!tracked || optedOut()) return;
    const ping = (beacon = false) => {
      const active = takeActive();
      if (active <= 0) return;
      const ids = currentIds();
      send({ v: ids.visitor, s: ids.session, t: 'ping', p: location.pathname, a: active }, beacon);
    };
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') ping();
    }, PING_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') ping(true);
      else visibleSince.current = Date.now();
    };
    const onHide = () => ping(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
    };
  }, [tracked]);

  return null;
}
