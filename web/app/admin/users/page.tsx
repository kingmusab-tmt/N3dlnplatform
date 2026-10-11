import { Badge, PageTitle, SearchForm, Table } from '@/components/admin/ui';
import { formatAgo, formatDateTime } from '@/lib/admin/format';
import { requireAdminPage } from '@/lib/server/admin';
import { listUsers } from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdminPage();
  const q = (await searchParams).q ?? '';
  const users = await listUsers(getDeps().db, q);

  return (
    <div className="space-y-4">
      <PageTitle title={`Users (${users.length}${users.length === 200 ? '+' : ''})`}>
        <SearchForm action="/admin/users" defaultValue={q} placeholder="Email or phone" />
      </PageTitle>
      <p className="text-sm text-slate-400">People who have signed in with an email or SMS code. Newest first.</p>
      <Table head={['Account', 'Joined', 'Last sign-in', 'Places', '']} empty={users.length === 0}>
        {users.map((u) => (
          <tr key={u.id}>
            <td className="px-3 py-2">
              <span className="text-slate-100">{u.email ?? (u.phone ? `+${u.phone}` : '–')}</span>
              {u.email && u.phone && <span className="block text-xs text-slate-500">+{u.phone}</span>}
            </td>
            <td className="whitespace-nowrap px-3 py-2">{formatDateTime(u.created_at)}</td>
            <td className="whitespace-nowrap px-3 py-2">{formatAgo(u.last_sign_in_at)}</td>
            <td className="px-3 py-2 tabular-nums">{u.places}</td>
            <td className="px-3 py-2">{u.is_admin && <Badge tone="green">Admin</Badge>}</td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
