// GET /api/v1/admin/analytics/export?range=7d&kind=report|visits — CSV downloads.
//   report: the dashboard's figures for the range (summary, per day, durations, pages, sources…)
//   visits: one row per visit (raw data), oldest first
import { formatDuration, formatPercent } from '@/lib/admin/format';
import { adminRoute } from '@/lib/server/admin';
import {
  EXPORT_MAX_ROWS,
  RANGES,
  durationBreakdown,
  exportVisits,
  parseRange,
  visitorBreakdowns,
  visitorSummary,
  visitorTrend,
} from '@/lib/server/adminData';
import { csvResponse, toCsv } from '@/lib/server/csv';
import { jsonError } from '@/lib/server/http';

const lagosTime = (d: Date) =>
  d.toLocaleString('en-GB', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export const GET = adminRoute(async (req, { deps }) => {
  const params = new URL(req.url).searchParams;
  const range = parseRange(params.get('range'));
  const kind = params.get('kind') ?? 'report';
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === 'visits') {
    const visits = await exportVisits(deps.db, range);
    const rows = [
      ['Started (Lagos time)', 'Last activity (Lagos time)', 'Duration (seconds)', 'Duration', 'Page views', 'Landing page', 'Pages visited', 'Referrer', 'Device', 'Country', 'Visitor', 'New or returning'],
      ...visits.map((v) => [
        lagosTime(new Date(v.started_at)),
        lagosTime(new Date(v.last_seen_at)),
        v.active_seconds,
        formatDuration(v.active_seconds),
        v.pageviews,
        v.entry_path,
        v.pages,
        v.referrer_host ?? 'Direct / unknown',
        v.device,
        v.country ?? '',
        v.visitor_id,
        v.returning ? 'returning' : 'new',
      ]),
    ];
    if (visits.length === EXPORT_MAX_ROWS) rows.push([], [`Only the first ${EXPORT_MAX_ROWS} visits are included; choose a shorter range.`]);
    return csvResponse(toCsv(rows), `visits-${range}-${stamp}.csv`);
  }
  if (kind !== 'report') return jsonError(400, 'INVALID_KIND', 'kind must be "report" or "visits".');

  const [summary, trend, durations, b] = await Promise.all([
    visitorSummary(deps.db, range),
    visitorTrend(deps.db, range),
    durationBreakdown(deps.db, range),
    visitorBreakdowns(deps.db, range),
  ]);
  const ranked = (title: string, head: string, items: { label: string; visits: number; visitors: number }[], count = 'Visits') => [
    [],
    [title],
    [head, count, 'Visitors'],
    ...items.map((r) => [r.label, r.visits, r.visitors]),
  ];

  const rows = [
    ['TMTechEasy Gate visitor report'],
    ['Period', RANGES[range].label],
    ['Generated', `${lagosTime(new Date())} (Lagos time)`],
    [],
    ['Summary'],
    ['Metric', 'Value'],
    ['Visitors', summary.visitors],
    ['New visitors', summary.newVisitors],
    ['Returning visitors', summary.visitors - summary.newVisitors],
    ['Visits', summary.visits],
    ['Page views', summary.pageviews],
    ['Pages per visit', summary.visits ? (summary.pageviews / summary.visits).toFixed(1) : ''],
    ['Average visit', formatDuration(summary.avgSeconds)],
    ['Average visit (seconds)', summary.avgSeconds],
    ['Median visit', formatDuration(summary.medianSeconds)],
    ['Median visit (seconds)', summary.medianSeconds],
    ['Total time on site', formatDuration(summary.totalSeconds)],
    ['Total time on site (seconds)', summary.totalSeconds],
    ['Bounce rate (one page, under 10 s)', formatPercent(summary.bounces, summary.visits)],
    ['On the site when generated', summary.liveNow],
    [],
    [trend.unit === 'hour' ? 'Visitors per hour' : 'Visitors per day'],
    [trend.unit === 'hour' ? 'Hour' : 'Date', 'Visitors', 'Visits', 'Page views', 'Average visit (seconds)'],
    ...trend.points.map((p) => [p.day.replace('T', ' '), p.visitors, p.visits, p.pageviews, p.avgSeconds]),
    [],
    ['How long visits last'],
    ['Duration', 'Visits', 'Share'],
    ...durations.map((d) => [d.label, d.visits, formatPercent(d.visits, summary.visits)]),
    ...ranked('Top pages', 'Page', b.pages, 'Page views'),
    ...ranked('Landing pages', 'Page', b.entryPages),
    ...ranked('Where visitors come from', 'Referrer', b.referrers),
    ...ranked('Devices', 'Device', b.devices),
    ...ranked('Countries', 'Country', b.countries),
  ];
  return csvResponse(toCsv(rows), `visitor-report-${range}-${stamp}.csv`);
});
