import Link from 'next/link';
import BarChart from '@/components/admin/BarChart';
import VisitData from '@/components/admin/VisitData';
import { Card, PageTitle, RankedList, Stat, Table } from '@/components/admin/ui';
import { formatAgo, formatCount, formatDuration, formatPercent } from '@/lib/admin/format';
import { requireAdminPage } from '@/lib/server/admin';
import {
  RANGES,
  durationBreakdown,
  parseRange,
  platformTotals,
  recentVisits,
  visitorBreakdowns,
  visitorSummary,
  visitDataStats,
  visitorTrend,
} from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  await requireAdminPage();
  const range = parseRange((await searchParams).range);
  const db = getDeps().db;
  const [summary, trend, durations, breakdowns, recent, totals, dataStats] = await Promise.all([
    visitorSummary(db, range),
    visitorTrend(db, range),
    durationBreakdown(db, range),
    visitorBreakdowns(db, range),
    recentVisits(db),
    platformTotals(db, range),
    visitDataStats(db),
  ]);

  const trendData = trend.points.map((p) => {
    const d = new Date(`${p.day}${trend.unit === 'hour' ? ':00' : 'T00:00:00'}`);
    return {
      key: p.day,
      label:
        trend.unit === 'hour'
          ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
          : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      value: p.visitors,
      details: [
        ['Visits', p.visits.toLocaleString('en-NG')],
        ['Page views', p.pageviews.toLocaleString('en-NG')],
        ['Avg. visit', p.visits ? formatDuration(p.avgSeconds) : '–'],
      ] as [string, string][],
    };
  });
  const returning = summary.visitors - summary.newVisitors;

  return (
    <div className="space-y-6">
      <PageTitle title="Overview">
        <nav aria-label="Time range" className="flex gap-1 rounded-lg bg-slate-800 p-1 text-xs">
          {Object.entries(RANGES).map(([id, r]) => (
            <Link
              key={id}
              href={`/admin?range=${id}`}
              aria-current={id === range ? 'true' : undefined}
              className={`rounded-md px-2.5 py-1 font-medium ${id === range ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              {id === '24h' ? '24 h' : id.replace('d', ' days')}
            </Link>
          ))}
        </nav>
      </PageTitle>

      {/* ---- Visitors ---- */}
      <div>
        <h2 className="sr-only">Visitors</h2>
        <p className="mb-2 text-sm text-slate-400">
          {RANGES[range].label} ·{' '}
          <span className="text-emerald-300">
            <span aria-hidden>●</span> {summary.liveNow} on the site now
          </span>
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Visitors" value={formatCount(summary.visitors)} note={`${formatCount(summary.newVisitors)} new · ${formatCount(returning)} returning`} />
          <Stat label="Visits" value={formatCount(summary.visits)} note={summary.visitors ? `${(summary.visits / summary.visitors).toFixed(1)} per visitor` : undefined} />
          <Stat label="Average visit" value={formatDuration(summary.avgSeconds)} note={`median ${formatDuration(summary.medianSeconds)}`} />
          <Stat label="Total time on site" value={formatDuration(summary.totalSeconds)} />
          <Stat label="Page views" value={formatCount(summary.pageviews)} note={summary.visits ? `${(summary.pageviews / summary.visits).toFixed(1)} per visit` : undefined} />
          <Stat label="Bounce rate" value={formatPercent(summary.bounces, summary.visits)} note="one page, under 10 s" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Card title={`Visitors per ${trend.unit}`} subtitle="Unique visitors; hover a bar for visits, page views and average visit length.">
            <BarChart data={trendData} valueName="Visitors" ariaLabel={`Visitors per ${trend.unit}, ${RANGES[range].label.toLowerCase()}`} />
          </Card>
        </div>
        <Card title="How long visits last" subtitle="Time the page was open and visible.">
          <DurationList rows={durations} total={summary.visits} />
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title="Top pages" subtitle="Page views">
          <RankedList rows={breakdowns.pages.map((r) => ({ label: r.label, count: r.visits, note: `${r.visitors} visitors` }))} countLabel="Page views" />
        </Card>
        <Card title="Where visitors come from" subtitle="Visits by referring site">
          <RankedList rows={breakdowns.referrers.map((r) => ({ label: r.label, count: r.visits }))} countLabel="Visits" />
        </Card>
        <Card title="Landing pages" subtitle="First page of each visit">
          <RankedList rows={breakdowns.entryPages.map((r) => ({ label: r.label, count: r.visits }))} countLabel="Visits" />
        </Card>
        <Card title="Devices" subtitle="Visits">
          <RankedList rows={breakdowns.devices.map((r) => ({ label: r.label[0].toUpperCase() + r.label.slice(1), count: r.visits }))} countLabel="Visits" />
        </Card>
        <Card title="Countries" subtitle="Visits (from the hosting platform; unknown locally)">
          <RankedList rows={breakdowns.countries.map((r) => ({ label: r.label, count: r.visits }))} countLabel="Visits" />
        </Card>
      </div>

      {/* ---- Platform ---- */}
      <div>
        <h2 className="mb-2 text-lg font-semibold text-white">Platform</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Stat label="Buildings mapped" value={formatCount(totals.buildings)} />
          <Stat label="Accounts" value={formatCount(totals.users)} note={`${totals.newUsers} new in range`} />
          <Stat label="Claimed places" value={formatCount(totals.places)} note={`${totals.newPlaces} new in range`} />
          <Stat label="Delivery runs" value={formatCount(totals.runs)} note={`${totals.activeRuns} active now`} />
          <Stat label="Deliveries completed" value={formatCount(totals.delivered)} />
          <Stat label="Active API keys" value={formatCount(totals.apiKeys)} />
        </div>
      </div>

      <VisitData range={range} rangeLabel={RANGES[range].label} stats={dataStats} />

      <Card title="Recent visits" subtitle="Newest first. Visitors are anonymous: no names, IP addresses or cookies.">
        <Table head={['Started', 'Duration', 'Pages', 'Landing page', 'From', 'Device', 'Country', '']} empty={recent.length === 0}>
          {recent.map((v, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap px-3 py-1.5">{formatAgo(v.started_at)}</td>
              <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{formatDuration(v.active_seconds)}</td>
              <td className="px-3 py-1.5 tabular-nums">{v.pageviews}</td>
              <td className="max-w-48 truncate px-3 py-1.5 font-mono text-xs">{v.entry_path}</td>
              <td className="px-3 py-1.5">{v.referrer_host ?? '–'}</td>
              <td className="px-3 py-1.5 capitalize">{v.device}</td>
              <td className="px-3 py-1.5">{v.country ?? '–'}</td>
              <td className="px-3 py-1.5 text-xs text-slate-500">{v.returning ? 'returning' : 'new'}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/** Visits per duration bucket, in order (not ranked), with proportional bars. */
function DurationList({ rows, total }: { rows: { label: string; visits: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Duration</th>
          <th>Visits</th>
          <th>Share</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="w-24 whitespace-nowrap py-1 pr-2 text-slate-300">{r.label}</td>
            <td className="py-1">
              <span aria-hidden className="block h-3 rounded-r bg-[#0284c7]" style={{ width: `${(r.visits / max) * 100}%`, minWidth: r.visits ? 3 : 0 }} />
            </td>
            <td className="w-20 py-1 text-right tabular-nums text-slate-300">
              {r.visits} <span className="text-xs text-slate-500">{formatPercent(r.visits, total)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
