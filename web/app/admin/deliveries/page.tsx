import { Badge, PageTitle, Stat, Table } from '@/components/admin/ui';
import { formatAgo, formatDateTime } from '@/lib/admin/format';
import { requireAdminPage } from '@/lib/server/admin';
import { listRuns } from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminDeliveries() {
  await requireAdminPage();
  const runs = await listRuns(getDeps().db);
  const stops = runs.reduce((n, r) => n + r.stops, 0);
  const delivered = runs.reduce((n, r) => n + r.delivered, 0);
  const failed = runs.reduce((n, r) => n + r.failed, 0);

  return (
    <div className="space-y-4">
      <PageTitle title="Delivery runs" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Runs shown" value={String(runs.length)} note="latest 100" />
        <Stat label="Stops" value={String(stops)} />
        <Stat label="Delivered" value={String(delivered)} note={stops ? `${Math.round((delivered / stops) * 100)}% of stops` : undefined} />
        <Stat label="Not delivered" value={String(failed)} />
      </div>
      <Table head={['Started', 'Created by', 'Mode', 'Stops', 'Status', 'Rider last seen']} empty={runs.length === 0}>
        {runs.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap px-3 py-2">{formatDateTime(r.created_at)}</td>
            <td className="px-3 py-2 text-xs">{r.created_by}</td>
            <td className="px-3 py-2 capitalize">{r.profile === 'driving' ? 'Motorbike / car' : r.profile}</td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">
              {r.delivered}/{r.stops} delivered{r.failed > 0 && <span className="text-amber-300"> · {r.failed} not</span>}
            </td>
            <td className="px-3 py-2">
              <Badge tone={r.status === 'active' ? 'sky' : r.failed > 0 ? 'amber' : 'green'}>
                {r.status === 'active' ? 'Active' : 'Ended'}
              </Badge>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatAgo(r.position_at)}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
