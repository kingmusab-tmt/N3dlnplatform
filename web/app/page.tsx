import NavigationMap from '@/components/NavigationMap';

// /?code=FC02SIMBP87 opens straight onto that building (used after signing in to claim it).
export default async function Home({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  return (
    <main className="h-dvh w-full">
      <NavigationMap initialCode={typeof code === 'string' ? code : undefined} />
    </main>
  );
}
