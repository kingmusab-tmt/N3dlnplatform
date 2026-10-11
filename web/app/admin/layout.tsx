import type { Metadata } from 'next';
import Link from 'next/link';
import AdminNav from '@/components/admin/AdminNav';
import { requireAdminPage } from '@/lib/server/admin';

export const metadata: Metadata = {
  title: 'Admin · TMTechEasy Gate',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

// Each page also calls requireAdminPage(): layouts aren't re-run on every
// client-side navigation, so they can't be the only guard.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPage();
  return (
    <div className="min-h-dvh bg-[#0b0f14] text-slate-200">
      <header className="border-b border-white/10 bg-slate-950/60">
        <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/admin" className="flex items-center gap-2 font-semibold text-white">
              <span aria-hidden className="h-3 w-3 rounded-sm bg-[#39FF14]" />
              TMTechEasy Gate <span className="font-normal text-slate-400">· Admin</span>
            </Link>
            <p className="text-xs text-slate-400">
              {admin.email ?? admin.phone} ·{' '}
              <Link href="/" className="underline hover:text-slate-200">
                Back to site
              </Link>
            </p>
          </div>
          <div className="mt-3">
            <AdminNav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
