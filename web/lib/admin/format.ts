// Display helpers for the admin dashboard (safe on server and client).

/** 45 s · 2 min 05 s · 1 h 03 min */
export function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** 1,284 · 12.9K · 4.2M */
export function formatCount(n: number) {
  if (n < 10_000) return n.toLocaleString('en-NG');
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export function formatPercent(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '–';
}

/** "12 Oct, 14:05" in Nigerian time. */
export function formatDateTime(iso: string | null) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  });
}

/** "just now" · "5 min ago" · "3 h ago" · "12 Oct" */
export function formatAgo(iso: string | null, now = Date.now()) {
  if (!iso) return 'never';
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
}
