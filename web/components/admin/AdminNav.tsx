'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/places', label: 'Places' },
  { href: '/admin/deliveries', label: 'Deliveries' },
  { href: '/admin/keys', label: 'API keys' },
  { href: '/admin/admins', label: 'Admins' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin sections" className="-mb-px flex gap-1 overflow-x-auto text-sm">
      {TABS.map((t) => {
        const current = t.href === '/admin' ? pathname === '/admin' : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={current ? 'page' : undefined}
            className={`shrink-0 border-b-2 px-3 py-2 font-medium ${
              current ? 'border-[#39FF14] text-white' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
