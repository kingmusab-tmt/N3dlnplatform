import ActionButton from '@/components/admin/ActionButton';
import { CreateKeyForm } from '@/components/admin/CreateForm';
import { Badge, PageTitle, Table } from '@/components/admin/ui';
import { formatAgo, formatDateTime } from '@/lib/admin/format';
import { requireAdminPage } from '@/lib/server/admin';
import { listKeys } from '@/lib/server/adminData';
import { getDeps } from '@/lib/server/deps';

export default async function AdminKeys() {
  await requireAdminPage();
  const keys = await listKeys(getDeps().db);

  return (
    <div className="space-y-4">
      <PageTitle title="Partner API keys" />
      <p className="text-sm text-slate-400">
        Keys let logistics partners, shops and control rooms call the API (see{' '}
        <a href="/api/v1/docs" className="underline">
          the API docs
        </a>
        ). Only a hash is stored; a revoked key stops working within a minute.
      </p>
      <CreateKeyForm />
      <Table head={['Partner', 'Key', 'Limit', 'Created', 'Last used', 'Runs', 'Status', '']} empty={keys.length === 0}>
        {keys.map((k) => (
          <tr key={k.id} className={k.revoked_at ? 'opacity-60' : undefined}>
            <td className="px-3 py-2 text-slate-100">{k.name}</td>
            <td className="px-3 py-2 font-mono text-xs">{k.key_prefix}…</td>
            <td className="whitespace-nowrap px-3 py-2 tabular-nums">{k.rate_limit_per_min}/min</td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatDateTime(k.created_at)}</td>
            <td className="whitespace-nowrap px-3 py-2 text-xs">{formatAgo(k.last_used_at)}</td>
            <td className="px-3 py-2 tabular-nums">{k.runs}</td>
            <td className="px-3 py-2">{k.revoked_at ? <Badge tone="slate">Revoked</Badge> : <Badge tone="green">Active</Badge>}</td>
            <td className="px-3 py-2 text-right">
              {!k.revoked_at && (
                <ActionButton
                  url={`/api/v1/admin/keys/${k.id}`}
                  label="Revoke"
                  ariaLabel={`Revoke key for ${k.name}`}
                  confirmText={`Revoke the key for ${k.name}? Their integration stops working within a minute.`}
                />
              )}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
