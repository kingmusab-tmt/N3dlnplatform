import Link from 'next/link';
import ActionButton from '@/components/admin/ActionButton';
import { Badge, PageTitle, SearchForm, Table } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin/format';
import { formatPostcode } from '@/lib/postcode';
import { requireAdminPage } from '@/lib/server/admin';
import { listPlaces } from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminPlaces({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const q = (await searchParams).q ?? '';
  const places = await listPlaces(getDeps().db, q);

  return (
    <div className="space-y-4">
      <PageTitle title={`Claimed places (${places.length}${places.length === 200 ? '+' : ''})`}>
        <SearchForm action="/admin/places" defaultValue={q} placeholder="Label, code, notes or owner" />
      </PageTitle>
      <p className="text-sm text-slate-400">
        Owner-submitted labels and notes appear on public share links. Remove anything abusive or false; the place’s share
        link stops working.
      </p>
      <Table head={['Place', 'Building', 'Notes', 'Owner', 'Created', '']} empty={places.length === 0}>
        {places.map((p) => (
          <tr key={p.id} className="align-top">
            <td className="px-3 py-2">
              <span className="text-slate-100">{p.label}</span>
              {p.has_gate && (
                <span className="ml-2">
                  <Badge tone="amber">Gate</Badge>
                </span>
              )}
            </td>
            <td className="whitespace-nowrap px-3 py-2">
              <Link href={`/map?code=${p.nipost_code}`} className="font-mono text-xs text-[#39FF14] hover:underline">
                {formatPostcode(p.nipost_code)}
              </Link>
              {p.building_name && <span className="block text-xs text-slate-500">{p.building_name}</span>}
            </td>
            <td className="max-w-64 px-3 py-2 text-xs text-slate-400">{p.delivery_notes ?? '–'}</td>
            <td className="px-3 py-2 text-xs">{p.owner ?? <span className="text-slate-500">anonymous / API</span>}</td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(p.created_at)}</td>
            <td className="px-3 py-2 text-right">
              <ActionButton
                url={`/api/v1/admin/places/${p.id}`}
                label="Remove"
                ariaLabel={`Remove place ${p.label}`}
                confirmText={`Remove “${p.label}”? Its share link will stop working. This can't be undone.`}
              />
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
