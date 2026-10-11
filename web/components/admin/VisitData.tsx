'use client';
// Reports (CSV downloads) and manual clean-up of raw visit data.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CLEANUP_CHOICES = [
  { days: 30, label: 'Older than 30 days' },
  { days: 90, label: 'Older than 90 days' },
  { days: 180, label: 'Older than 6 months' },
  { days: 365, label: 'Older than 1 year' },
  { days: 0, label: 'All visit data' },
];

export default function VisitData({
  range,
  rangeLabel,
  stats,
}: {
  range: string;
  rangeLabel: string;
  stats: { visits: number; pageviews: number; oldest: string | null };
}) {
  const router = useRouter();
  const [days, setDays] = useState(365);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const exportUrl = (kind: 'report' | 'visits') => `/api/v1/admin/analytics/export?range=${range}&kind=${kind}`;
  const choice = CLEANUP_CHOICES.find((c) => c.days === days)!;

  async function cleanUp() {
    const what = days === 0 ? 'ALL visit data (the dashboard starts again from zero)' : `visit data ${choice.label.toLowerCase()}`;
    if (!confirm(`Permanently delete ${what}? Download a report first if you need it. This can't be undone.`)) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/v1/admin/analytics?older_than_days=${days}`, { method: 'DELETE' }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ ok: false, text: body?.message ?? 'Clean-up failed. Try again.' });
    setMessage({
      ok: true,
      text: `Deleted ${plural(body.deleted_visits, 'visit')} (${plural(body.deleted_pageviews, 'page view')}).`,
    });
    router.refresh();
  }

  return (
    <section className="grid min-w-0 gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-4 md:grid-cols-2">
      <div>
        <h2 className="font-semibold text-white">Download a report</h2>
        <p className="text-xs text-slate-400">CSV files that open in Excel or Google Sheets. Period: {rangeLabel.toLowerCase()}.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={exportUrl('report')}
            download
            className="rounded-lg bg-[#39FF14] px-3 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110"
          >
            ↓ Visitor report
          </a>
          <a href={exportUrl('visits')} download className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">
            ↓ Raw visits
          </a>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          The report has the summary, visitors per day, visit durations, pages, sources, devices and countries. Raw visits
          has one row per visit with its duration and the pages it went through.
        </p>
      </div>

      <div>
        <h2 className="font-semibold text-white">Clean up visit data</h2>
        <p className="text-xs text-slate-400">
          Stored: {stats.visits.toLocaleString('en-NG')} visits, {stats.pageviews.toLocaleString('en-NG')} page views
          {stats.oldest &&
            `, since ${new Date(stats.oldest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' })}`}
          .
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <label htmlFor="cleanup-days" className="sr-only">
            Visit data to delete
          </label>
          <select
            id="cleanup-days"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          >
            {CLEANUP_CHOICES.map((c) => (
              <option key={c.days} value={c.days}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={cleanUp}
            disabled={busy || stats.visits === 0}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-sm font-medium text-red-300 hover:bg-red-400/10 disabled:opacity-50"
          >
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
            {message.text}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">Deleted visits disappear from every chart and total. Accounts, places and deliveries aren’t touched.</p>
      </div>
    </section>
  );
}

const plural = (n: number, word: string) => `${n.toLocaleString('en-NG')} ${word}${n === 1 ? '' : 's'}`;
