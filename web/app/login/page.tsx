import type { Metadata } from 'next';
import LoginForm from '@/components/LoginForm';

export const metadata: Metadata = { title: 'Sign in · TMTechEasy Gate', robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Only same-site paths, so the login page can't be used to redirect elsewhere.
  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/account';
  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b0f14] p-4">
      <LoginForm next={safeNext} />
    </main>
  );
}
