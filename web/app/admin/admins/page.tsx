import ActionButton from '@/components/admin/ActionButton';
import { AddAdminForm } from '@/components/admin/CreateForm';
import { PageTitle, Table } from '@/components/admin/ui';
import { formatDateTime } from '@/lib/admin/format';
import { requireAdminPage } from '@/lib/server/admin';
import { listAdmins } from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminAdmins() {
  const me = await requireAdminPage();
  const admins = await listAdmins(getDeps().db);

  return (
    <div className="space-y-4">
      <PageTitle title="Admins" />
      <p className="text-sm text-slate-400">Admins can see visitor statistics, users and places, and manage API keys.</p>
      <AddAdminForm />
      <Table head={['Admin', 'Since', 'Added by', '']}>
        {admins.map((a) => (
          <tr key={a.user_id}>
            <td className="px-3 py-2 text-slate-100">
              {a.email ?? (a.phone ? `+${a.phone}` : a.user_id)}
              {a.user_id === me.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(a.created_at)}</td>
            <td className="px-3 py-2 text-xs">{a.added_by ?? 'setup script'}</td>
            <td className="px-3 py-2 text-right">
              {admins.length > 1 && (
                <ActionButton
                  url={`/api/v1/admin/admins/${a.user_id}`}
                  label="Remove"
                  ariaLabel={`Remove admin ${a.email ?? a.phone ?? ''}`}
                  confirmText={a.user_id === me.id ? 'Remove your own admin access?' : 'Remove this admin?'}
                />
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
